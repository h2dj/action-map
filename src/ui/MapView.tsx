/**
 * 지도 보기: 시간·협력·목적. 같은 기록을 질문에 따라 다른 배치로 보여준다 (F05).
 * - 선택은 보기를 바꿔도 유지되고, 선택 대상과 직접 연결된 대상을 강조한다 (F06)
 * - 지도 검색·관계 필터·전체 맞춤 (F06), 현재 지도 이미지 저장 (F08)
 * - 방향키로 가까운 대상으로 이동, Enter로 이름 편집 (F10)
 * 끌어 옮긴 위치·접기 상태는 보기별로 저장하며 실행 취소 대상은 아니다.
 */
import {
  applyNodeChanges,
  Background,
  Controls,
  getNodesBounds,
  getViewportForBounds,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng, toSvg } from 'html-to-image';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Evidence, Id, MapDocument, RelationStatus, ViewId } from '../domain/schema';
import { contributionKindLabel, evidenceLabel, relationStatusLabel } from '../domain/vocab';
import { downloadDataUrl } from '../runtime';
import { mapStore, useMap } from '../store/mapStore';
import { projectCollab } from '../views/collabView';
import { loopRelationIds, projectLoop } from '../views/loopView';
import { chooseSides, filterEdges, nearestInDirection, searchNodes, type Direction, type Side } from '../views/interact';
import { emptyView, type Projection, type VEdge, type VNode } from '../views/model';
import { projectPurpose } from '../views/purposeView';
import { hasDates, projectTime } from '../views/timeView';
import { useUi, type MapViewId } from './uiStore';

type EntityData = Extract<VNode, { kind: 'entity' }> & {
  state: '' | 'selected' | 'neighbor' | 'dim';
  match: boolean;
  viewId: ViewId;
};
type LaneData = Extract<VNode, { kind: 'lane' }>;
type LoopData = Extract<VNode, { kind: 'loop' }> & { state: '' | 'selected' | 'dim' };

function toggleCollapsed(viewId: ViewId, id: Id) {
  mapStore.getState().runView((d) => {
    const v = (d.views[viewId] ??= emptyView(viewId));
    v.collapsed = v.collapsed.includes(id) ? v.collapsed.filter((c) => c !== id) : [...v.collapsed, id];
  });
}

const sidePos: Record<Side, Position> = { l: Position.Left, r: Position.Right, t: Position.Top, b: Position.Bottom };
const SIDES: Side[] = ['l', 'r', 't', 'b'];

const EntityNode = memo(function EntityNode({ data }: NodeProps<Node<EntityData>>) {
  return (
    <div
      className={`vnode tone-${data.tone} ${data.state}${data.tentative ? ' tentative' : ''}${data.match ? ' match' : ''}`}
      style={{ width: data.w, height: data.h }}
      title={data.sub ? `${data.label}\n${data.sub}` : data.label}
    >
      {SIDES.map((s) => (
        <Handle key={`s${s}`} id={`s${s}`} type="source" position={sidePos[s]} isConnectable={false} />
      ))}
      {SIDES.map((s) => (
        <Handle key={`t${s}`} id={`t${s}`} type="target" position={sidePos[s]} isConnectable={false} />
      ))}
      <div className="vnode-title">{data.label}</div>
      {data.sub && <div className="vnode-sub">{data.sub}</div>}
      {!!data.childCount && (
        <button
          className="vnode-toggle nodrag"
          aria-expanded={!data.collapsed}
          aria-label={`지도에서 ${data.label} 하위 활동 ${data.collapsed ? '펼치기' : '접기'}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapsed(data.viewId, data.id);
          }}
        >
          {data.collapsed ? `▸ 하위 ${data.childCount}` : '▾ 접기'}
        </button>
      )}
    </div>
  );
});

const LaneNode = memo(function LaneNode({ data }: NodeProps<Node<LaneData>>) {
  return (
    <div className={`vlane tone-${data.tone}`} style={{ width: data.w, height: data.h }}>
      <div className="vlane-title">{data.label}</div>
      {data.sub && <div className="vlane-sub">{data.sub}</div>}
    </div>
  );
});

const LoopNode = memo(function LoopNode({ data }: NodeProps<Node<LoopData>>) {
  return (
    <div className={`vloop kind-${data.loopKind} ${data.state}`} style={{ width: data.w, height: data.h }} title="순환 — 눌러서 판정과 구성 보기">
      {data.label}
    </div>
  );
});

const nodeTypes = { entity: EntityNode, lane: LaneNode, loop: LoopNode };

const toneColor: Record<VEdge['tone'], string> = {
  link: 'var(--edge-link)',
  role: 'var(--edge-role)',
  contribution: 'var(--edge-contribution)',
  enabling: 'var(--edge-enabling)',
  factor: 'var(--edge-factor)',
  actor: 'var(--edge-actor)',
  influence: 'var(--edge-influence)',
};

function edgeStyle(e: VEdge, state: '' | 'hot' | 'dim') {
  const width = e.evidence === 'confirmed' ? 3 : e.evidence === 'observed' ? 2 : 1.5;
  const dash = e.status === 'planned' || e.tone === 'enabling' ? '7 5' : e.aggregated ? '2 4' : undefined;
  return {
    stroke: toneColor[e.tone],
    strokeWidth: state === 'hot' ? width + 1 : width,
    strokeDasharray: dash,
    opacity: state === 'dim' ? 0.15 : e.status === 'ended' ? 0.45 : 1,
  };
}

type Options = {
  timeMode: 'layer' | 'date';
  collabFocus: boolean;
  collabContribution: '' | 'time' | 'money' | 'space' | 'knowledge' | 'network';
  loopShowLinked: boolean;
};

function project(doc: MapDocument, view: MapViewId, opts: Options, selected?: Id): Projection {
  const vs = doc.views[view];
  if (view === 'time') return projectTime(doc, vs, opts.timeMode === 'date' && hasDates(doc) ? 'date' : 'layer');
  if (view === 'collab')
    return projectCollab(doc, vs, {
      focusId: opts.collabFocus && selected && (doc.actors[selected] || doc.activities[selected]) ? selected : undefined,
      contribution: opts.collabContribution || undefined,
    });
  if (view === 'loop') return projectLoop(doc, vs, { showLinked: opts.loopShowLinked });
  return projectPurpose(doc, vs);
}

const VIEWS: [MapViewId, string, string][] = [
  ['time', '시간', '어떻게 이어져 왔고, 어디로 이어질까?'],
  ['collab', '협력', '누가 어떤 역할로 참여하고 무엇을 제공할까?'],
  ['purpose', '목적', '어떤 변화와 가치에 기여할까?'],
  ['loop', '순환', '어떤 영향이 되돌아와 상황을 강화하거나 조절할까?'],
];

/** 선 라벨이 이보다 많으면, 선택한 대상 주변의 라벨만 보여 겹침을 줄인다 */
const LABEL_LIMIT = 14;

export function MapView() {
  return (
    <ReactFlowProvider>
      <MapViewInner />
    </ReactFlowProvider>
  );
}

function MapViewInner() {
  const doc = useMap((s) => s.doc);
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  const setOptions = useUi((s) => s.setOptions);
  const selection = useUi((s) => s.selection);
  const select = useUi((s) => s.select);
  const timeMode = useUi((s) => s.timeMode);
  const collabFocus = useUi((s) => s.collabFocus);
  const collabContribution = useUi((s) => s.collabContribution);
  const loopShowLinked = useUi((s) => s.loopShowLinked);
  const open = useUi((s) => s.open);
  const opts: Options = { timeMode, collabFocus, collabContribution, loopShowLinked };
  const selectedEntity = selection?.kind === 'entity' ? selection.id : undefined;
  const selectedRelation = selection?.kind === 'relation' ? selection.id : undefined;
  const selectedLoop = selection?.kind === 'loop' ? selection.id : undefined;
  const dated = hasDates(doc);
  const flow = useReactFlow();
  const flowBox = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RelationStatus>('all');
  const [minEvidence, setMinEvidence] = useState<Evidence>('hypothesis');
  const [allLabels, setAllLabels] = useState(false);

  const projection = useMemo(
    () => project(doc, view, opts, selectedEntity),
    [doc, view, timeMode, collabFocus, collabContribution, loopShowLinked, selectedEntity],
  );
  const visibleEdges = useMemo(
    () => filterEdges(projection.edges, { status: statusFilter, minEvidence }),
    [projection, statusFilter, minEvidence],
  );
  const matches = useMemo(() => new Set(searchNodes(projection.nodes, query)), [projection, query]);

  const { nodes, edges } = useMemo(() => {
    const hot = new Set<string>();
    const hotEdges = new Set<string>();
    const mark = (e: VEdge) => {
      hot.add(e.source);
      hot.add(e.target);
      hotEdges.add(e.id);
    };
    if (selectedEntity) {
      hot.add(selectedEntity);
      for (const e of visibleEdges) if (e.source === selectedEntity || e.target === selectedEntity) mark(e);
    }
    if (selectedRelation) for (const e of visibleEdges) if (e.relationId === selectedRelation) mark(e);
    if (selectedLoop) {
      const rels = new Set(loopRelationIds(doc, selectedLoop));
      for (const e of visibleEdges) if (rels.has(e.relationId)) mark(e);
    }
    const focusing = hot.size > 0;
    const boxes = new Map(projection.nodes.map((n) => [n.id, n]));
    const showAllLabels = allLabels || visibleEdges.length <= LABEL_LIMIT;

    const nodes: Node[] = projection.nodes.map((n) =>
      n.kind === 'lane'
        ? { id: n.id, type: 'lane', position: { x: n.x, y: n.y }, data: n, draggable: false, selectable: false, focusable: false, zIndex: -1, width: n.w, height: n.h }
        : n.kind === 'loop'
          ? {
              id: n.id,
              type: 'loop',
              position: { x: n.x, y: n.y },
              width: n.w,
              height: n.h,
              zIndex: 3,
              ariaLabel: `순환 ${n.label}`,
              data: { ...n, state: n.id === selectedLoop ? 'selected' : focusing ? 'dim' : '' } satisfies LoopData,
            }
          : {
            id: n.id,
            type: 'entity',
            position: { x: n.x, y: n.y },
            width: n.w,
            height: n.h,
            ariaLabel: `${n.label}${n.kind === 'entity' && n.sub ? `, ${n.sub}` : ''}`,
            data: {
              ...n,
              viewId: view,
              match: matches.has(n.id),
              state: n.id === selectedEntity ? 'selected' : focusing ? (hot.has(n.id) ? 'neighbor' : 'dim') : '',
            } satisfies EntityData,
          },
    );
    const edges: Edge[] = visibleEdges.map((e) => {
      const state = hotEdges.has(e.id) ? 'hot' : focusing ? 'dim' : '';
      const text = e.label ?? (e.aggregated ? '하위 활동의 연결' : undefined);
      const label = state === 'hot' || (showAllLabels && state !== 'dim') ? text : undefined;
      const a = boxes.get(e.source);
      const b = boxes.get(e.target);
      const sides = a && b ? chooseSides(a, b) : { source: 'r' as Side, target: 'l' as Side };
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: `s${sides.source}`,
        targetHandle: `t${sides.target}`,
        label,
        ariaLabel: `${text ?? '연결'}, ${relationStatusLabel[e.status]}, ${evidenceLabel[e.evidence]}`,
        selected: e.relationId === selectedRelation,
        style: edgeStyle(e, state),
        labelStyle:
          e.sign && (e.tone === 'influence' || e.tone === 'factor')
            ? { fontSize: 16, fontWeight: 700, fill: e.sign === '+' ? 'var(--pos)' : e.sign === '-' ? 'var(--neg)' : 'var(--warn)' }
            : { fontSize: 11, fill: 'var(--text)' },
        labelBgStyle: { fill: 'var(--surface)', opacity: 0.92 },
        labelBgPadding: [4, 2] as [number, number],
        markerEnd: e.directed ? { type: MarkerType.ArrowClosed, color: toneColor[e.tone], width: 16, height: 16 } : undefined,
        data: { relationId: e.relationId },
        zIndex: state === 'hot' ? 2 : 1,
      };
    });
    return { nodes, edges };
  }, [projection, visibleEdges, matches, selectedEntity, selectedRelation, selectedLoop, view, allLabels, doc]);

  // 끌기 중 위치는 화면 상태로 들고 있다가, 놓을 때 보기 상태에 저장한다
  const [rfNodes, setRfNodes] = useState<Node[]>(nodes);
  useEffect(() => setRfNodes(nodes), [nodes]);
  const onNodesChange = (changes: NodeChange[]) =>
    setRfNodes((ns) => applyNodeChanges(changes.filter((c) => c.type === 'position' || c.type === 'dimensions'), ns));

  // 검색 결과로 화면 맞춤
  const fitTo = (ids: Id[]) => {
    if (ids.length) void flow.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.4, duration: 300, maxZoom: 1.2 });
  };

  // 방향키 이동·Enter 편집 (입력 중이거나 대화상자가 열려 있으면 무시)
  useEffect(() => {
    const keys: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('dialog[open]')) return;
      if (t?.closest('.panel, .entity-list, .topbar')) return;
      const dir = keys[e.key];
      if (dir) {
        const next = nearestInDirection(projection.nodes, selectedEntity ?? '', dir);
        if (next) {
          e.preventDefault();
          select({ kind: 'entity', id: next });
          const n = flow.getNode(next);
          if (n) void flow.setCenter(n.position.x + (n.width ?? 0) / 2, n.position.y + (n.height ?? 0) / 2, { zoom: flow.getZoom(), duration: 200 });
        }
      } else if (e.key === 'Enter' && selectedEntity) {
        e.preventDefault();
        select({ kind: 'entity', id: selectedEntity }, { justCreated: true }); // 이름 입력란으로 초점
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projection, selectedEntity, flow, select]);

  async function exportImage(kind: 'png' | 'svg') {
    const viewport = flowBox.current?.querySelector<HTMLElement>('.react-flow__viewport');
    const all = flow.getNodes();
    if (!viewport || !all.length) return;
    const bounds = getNodesBounds(all);
    const pad = 40;
    const width = Math.ceil(bounds.width + pad * 2);
    const height = Math.ceil(bounds.height + pad * 2);
    const vp = getViewportForBounds(bounds, width, height, 1, 1, 0);
    const bg = getComputedStyle(document.body).getPropertyValue('background-color') || '#ffffff';
    const options = {
      backgroundColor: bg,
      width,
      height,
      style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x + pad}px, ${vp.y + pad}px) scale(1)` },
    };
    try {
      const url = kind === 'png' ? await toPng(viewport, { ...options, pixelRatio: 2 }) : await toSvg(viewport, options);
      const label = VIEWS.find(([id]) => id === view)![1];
      const safe = doc.workspace.name.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'action-map';
      downloadDataUrl(`${safe}_${label}보기.${kind}`, url);
    } catch (err) {
      useUi.getState().notify({ level: 'error', text: `이미지를 만들지 못했습니다: ${(err as Error).message}` });
    }
  }

  const hasSaved = Object.keys(doc.views[view]?.positions ?? {}).length > 0;
  const hiddenEdges = projection.edges.length - visibleEdges.length;

  return (
    <div className="mapview">
      <div className="view-bar">
        <div role="tablist" aria-label="보기 전환" className="tabs">
          {VIEWS.map(([id, label, q]) => (
            <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'active' : ''} onClick={() => setView(id)} title={q}>
              {label} 보기
            </button>
          ))}
        </div>
        <p className="view-question">{VIEWS.find(([id]) => id === view)![2]}</p>
        <div className="view-options">
          <input
            type="search"
            className="map-search"
            placeholder="지도에서 찾기"
            aria-label="지도에서 찾기"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const ids = [...matches];
                fitTo(ids);
                if (ids.length === 1) select({ kind: 'entity', id: ids[0] });
              }
            }}
          />
          {query.trim() && (
            <span className="match-count" role="status">
              {matches.size}개
            </span>
          )}
          {view === 'time' && (
            <label>
              배치{' '}
              <select value={timeMode} onChange={(e) => setOptions({ timeMode: e.target.value as 'layer' | 'date' })}>
                <option value="layer">시간층</option>
                <option value="date" disabled={!dated}>
                  날짜{dated ? '' : ' (기간 입력 필요)'}
                </option>
              </select>
            </label>
          )}
          {view === 'collab' && (
            <>
              <label className="check">
                <input type="checkbox" checked={collabFocus} onChange={(e) => setOptions({ collabFocus: e.target.checked })} /> 선택 중심
              </label>
              <label>
                기여{' '}
                <select value={collabContribution} onChange={(e) => setOptions({ collabContribution: e.target.value as Options['collabContribution'] })}>
                  <option value="">전체</option>
                  {Object.entries(contributionKindLabel).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {view === 'loop' && (
            <>
              <label className="check">
                <input type="checkbox" checked={loopShowLinked} onChange={(e) => setOptions({ loopShowLinked: e.target.checked })} /> 활동 함께 보기
              </label>
              <button
                className="primary"
                onClick={() => open({ type: 'loop', startId: selectedEntity && doc.factors[selectedEntity] ? selectedEntity : undefined })}
              >
                + 순환 구성
              </button>
            </>
          )}
          <details className="menu view-menu">
            <summary>표시</summary>
            <div className="menu-body">
              <label>
                관계{' '}
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | RelationStatus)}>
                  <option value="all">모든 진행 상태</option>
                  {Object.entries(relationStatusLabel).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}만
                    </option>
                  ))}
                </select>
              </label>
              <label>
                근거{' '}
                <select value={minEvidence} onChange={(e) => setMinEvidence(e.target.value as Evidence)}>
                  <option value="hypothesis">가설 포함 전체</option>
                  <option value="observed">관찰 이상</option>
                  <option value="confirmed">자료로 확인만</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={allLabels} onChange={(e) => setAllLabels(e.target.checked)} /> 선 라벨 모두 보기
              </label>
              <hr />
              <button onClick={() => void exportImage('png')}>이미지로 저장 (PNG)</button>
              <button onClick={() => void exportImage('svg')}>이미지로 저장 (SVG)</button>
              {hasSaved && (
                <button
                  onClick={() =>
                    mapStore.getState().runView((d) => {
                      if (d.views[view]) d.views[view].positions = {};
                    })
                  }
                >
                  자동 배치로 되돌리기
                </button>
              )}
            </div>
          </details>
        </div>
      </div>

      <div className="flow" ref={flowBox} role="tabpanel" aria-label={`${VIEWS.find(([id]) => id === view)![1]} 보기`}>
        <ReactFlow
          key={`${view}:${timeMode}:${collabContribution}:${collabFocus ? selectedEntity : ''}`}
          nodes={rfNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.08 }}
          minZoom={0.2}
          maxZoom={2}
          nodesConnectable={false}
          elementsSelectable
          colorMode="system"
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => {
            if (n.type === 'entity') select({ kind: 'entity', id: n.id });
            else if (n.type === 'loop') select({ kind: 'loop', id: n.id });
          }}
          onEdgeClick={(_, e) => select({ kind: 'relation', id: (e.data as { relationId: Id }).relationId })}
          onPaneClick={() => select(null)}
          onNodeDragStop={(_, __, dragged) =>
            mapStore.getState().runView((d) => {
              const v = (d.views[view] ??= emptyView(view));
              for (const n of dragged) if (n.type === 'entity' || n.type === 'loop') v.positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
            })
          }
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} position="bottom-right" aria-label="확대·축소·전체 맞춤" />
        </ReactFlow>
      </div>

      <div className="legend" aria-label="범례">
        <span>
          <i className="ln solid" /> 현재 연결
        </span>
        <span>
          <i className="ln dashed" /> 만들고 싶은 연결
        </span>
        <span>
          <i className="ln thin" /> 가설 · <i className="ln mid" /> 관찰 · <i className="ln thick" /> 자료로 확인
        </span>
        {view === 'time' && (
          <span>
            <i className="ln factor" /> 공통 기반 사용·완화
          </span>
        )}
        {view === 'loop' && (
          <span>
            <b>+</b> 같은 방향 · <b>−</b> 반대 방향 · <b>?</b> 미정 · <b>‖</b> 지연 · ↻ 강화(R) · ↺ 균형(B)
          </span>
        )}
        <span className="keys">방향키: 가까운 대상으로 이동 · Enter: 이름 편집</span>
        {hiddenEdges > 0 && <span className="note">표시 설정으로 숨긴 관계 {hiddenEdges}개</span>}
        {!allLabels && visibleEdges.length > LABEL_LIMIT && <span className="note">선이 많아 선택한 대상 주변의 라벨만 보여줍니다.</span>}
        {projection.notes.map((n) => (
          <span key={n} className="note">
            {n}
          </span>
        ))}
        <span className="note">관계와 효과는 기록된 근거 상태를 따르며, 선의 굵기는 영향의 크기가 아닙니다.</span>
      </div>
    </div>
  );
}

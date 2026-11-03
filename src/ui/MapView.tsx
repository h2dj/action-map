/**
 * 지도 보기 (M4): 시간·협력·목적. 같은 기록을 질문에 따라 다른 배치로 보여준다 (F05).
 * 선택은 보기를 바꿔도 유지되고, 선택 대상과 직접 연결된 대상을 강조한다 (F06).
 * 끌어 옮긴 위치·접기 상태는 보기별로 저장하며 실행 취소 대상은 아니다.
 */
import {
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { memo, useEffect, useMemo, useState } from 'react';
import type { Id, MapDocument, ViewId } from '../domain/schema';
import { evidenceLabel } from '../domain/vocab';
import { mapStore, useMap } from '../store/mapStore';
import { projectCollab } from '../views/collabView';
import { emptyView, type Projection, type VEdge, type VNode } from '../views/model';
import { projectPurpose } from '../views/purposeView';
import { hasDates, projectTime } from '../views/timeView';
import { contributionKindLabel } from '../domain/vocab';
import { useUi, type MapViewId } from './uiStore';

type EntityData = Extract<VNode, { kind: 'entity' }> & { state: '' | 'selected' | 'neighbor' | 'dim'; viewId: ViewId };
type LaneData = Extract<VNode, { kind: 'lane' }>;

function toggleCollapsed(viewId: ViewId, id: Id) {
  mapStore.getState().runView((d) => {
    const v = (d.views[viewId] ??= emptyView(viewId));
    v.collapsed = v.collapsed.includes(id) ? v.collapsed.filter((c) => c !== id) : [...v.collapsed, id];
  });
}

const EntityNode = memo(function EntityNode({ data }: NodeProps<Node<EntityData>>) {
  return (
    <div
      className={`vnode tone-${data.tone} ${data.state}${data.tentative ? ' tentative' : ''}`}
      style={{ width: data.w, height: data.h }}
      title={data.sub ? `${data.label}\n${data.sub}` : data.label}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="vnode-title">{data.label}</div>
      {data.sub && <div className="vnode-sub">{data.sub}</div>}
      {!!data.childCount && (
        <button
          className="vnode-toggle nodrag"
          aria-expanded={!data.collapsed}
          aria-label={`지도에서 ${data.label} 하위 활동 ${data.collapsed ? "펼치기" : "접기"}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapsed(data.viewId, data.id);
          }}
        >
          {data.collapsed ? `▸ 하위 ${data.childCount}` : '▾ 접기'}
        </button>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
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

const nodeTypes = { entity: EntityNode, lane: LaneNode };

const toneColor: Record<VEdge['tone'], string> = {
  link: 'var(--edge-link)',
  role: 'var(--edge-role)',
  contribution: 'var(--edge-contribution)',
  enabling: 'var(--edge-enabling)',
  factor: 'var(--edge-factor)',
  actor: 'var(--edge-actor)',
};

function edgeStyle(e: VEdge, state: '' | 'hot' | 'dim') {
  const width = e.evidence === 'confirmed' ? 3 : e.evidence === 'observed' ? 2 : 1.5;
  const dash = e.status === 'planned' || e.tone === 'enabling' ? '7 5' : e.aggregated ? '2 4' : undefined;
  return {
    stroke: toneColor[e.tone],
    strokeWidth: state === 'hot' ? width + 1 : width,
    strokeDasharray: dash,
    opacity: state === 'dim' ? 0.2 : e.status === 'ended' ? 0.45 : 1,
  };
}

function project(doc: MapDocument, view: MapViewId, opts: ReturnType<typeof useOptions>, selected?: Id): Projection {
  const vs = doc.views[view];
  if (view === 'time') return projectTime(doc, vs, opts.timeMode === 'date' && hasDates(doc) ? 'date' : 'layer');
  if (view === 'collab')
    return projectCollab(doc, vs, {
      focusId: opts.collabFocus && selected && (doc.actors[selected] || doc.activities[selected]) ? selected : undefined,
      contribution: opts.collabContribution || undefined,
    });
  return projectPurpose(doc, vs);
}

function useOptions() {
  const timeMode = useUi((s) => s.timeMode);
  const collabFocus = useUi((s) => s.collabFocus);
  const collabContribution = useUi((s) => s.collabContribution);
  return { timeMode, collabFocus, collabContribution };
}

const VIEWS: [MapViewId, string, string][] = [
  ['time', '시간', '어떻게 이어져 왔고, 어디로 이어질까?'],
  ['collab', '협력', '누가 어떤 역할로 참여하고 무엇을 제공할까?'],
  ['purpose', '목적', '어떤 변화와 가치에 기여할까?'],
];

export function MapView() {
  const doc = useMap((s) => s.doc);
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  const setOptions = useUi((s) => s.setOptions);
  const selection = useUi((s) => s.selection);
  const select = useUi((s) => s.select);
  const opts = useOptions();
  const selectedEntity = selection?.kind === 'entity' ? selection.id : undefined;
  const selectedRelation = selection?.kind === 'relation' ? selection.id : undefined;
  const dated = hasDates(doc);

  const projection = useMemo(() => project(doc, view, opts, selectedEntity), [doc, view, opts.timeMode, opts.collabFocus, opts.collabContribution, selectedEntity]);

  const { nodes, edges } = useMemo(() => {
    // 강조: 선택한 대상(또는 관계의 양 끝)과 직접 이어진 대상
    const hot = new Set<string>();
    const hotEdges = new Set<string>();
    if (selectedEntity) {
      hot.add(selectedEntity);
      for (const e of projection.edges)
        if (e.source === selectedEntity || e.target === selectedEntity) {
          hot.add(e.source);
          hot.add(e.target);
          hotEdges.add(e.id);
        }
    }
    if (selectedRelation)
      for (const e of projection.edges)
        if (e.relationId === selectedRelation) {
          hot.add(e.source);
          hot.add(e.target);
          hotEdges.add(e.id);
        }
    const focusing = hot.size > 0;

    const nodes: Node[] = projection.nodes.map((n) =>
      n.kind === 'lane'
        ? { id: n.id, type: 'lane', position: { x: n.x, y: n.y }, data: n, draggable: false, selectable: false, focusable: false, zIndex: -1, width: n.w, height: n.h }
        : {
            id: n.id,
            type: 'entity',
            position: { x: n.x, y: n.y },
            width: n.w,
            height: n.h,
            selected: n.id === selectedEntity,
            ariaLabel: `${n.label}${n.sub ? `, ${n.sub}` : ''}`,
            data: {
              ...n,
              viewId: view,
              state: n.id === selectedEntity ? 'selected' : focusing ? (hot.has(n.id) ? 'neighbor' : 'dim') : '',
            } satisfies EntityData,
          },
    );
    const edges: Edge[] = projection.edges.map((e) => {
      const state = hotEdges.has(e.id) ? 'hot' : focusing ? 'dim' : '';
      const label = e.label ?? (e.aggregated ? '하위 활동의 연결' : undefined);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label,
        ariaLabel: `${label ?? ''} ${evidenceLabel[e.evidence]}`,
        selected: e.relationId === selectedRelation,
        style: edgeStyle(e, state),
        labelStyle: { fontSize: 11, fill: 'var(--text)', opacity: state === 'dim' ? 0.3 : 1 },
        labelBgStyle: { fill: 'var(--surface)', opacity: state === 'dim' ? 0.3 : 0.9 },
        markerEnd: e.directed ? { type: MarkerType.ArrowClosed, color: toneColor[e.tone], width: 16, height: 16 } : undefined,
        data: { relationId: e.relationId },
        zIndex: state === 'hot' ? 2 : 1,
      };
    });
    return { nodes, edges };
  }, [projection, selectedEntity, selectedRelation, view]);

  // 끌기 중 위치는 화면 상태로 들고 있다가, 놓을 때 보기 상태에 저장한다
  const [rfNodes, setRfNodes] = useState<Node[]>(nodes);
  useEffect(() => setRfNodes(nodes), [nodes]);
  const onNodesChange = (changes: NodeChange[]) =>
    setRfNodes((ns) => applyNodeChanges(changes.filter((c) => c.type === 'position' || c.type === 'dimensions'), ns));

  const hasSaved = Object.keys(doc.views[view]?.positions ?? {}).length > 0;

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
          {view === 'time' && (
            <label>
              배치{' '}
              <select value={opts.timeMode} onChange={(e) => setOptions({ timeMode: e.target.value as 'layer' | 'date' })}>
                <option value="layer">시간층 (해온·진행·하려는)</option>
                <option value="date" disabled={!dated}>
                  날짜{dated ? '' : ' (기간 입력 필요)'}
                </option>
              </select>
            </label>
          )}
          {view === 'collab' && (
            <>
              <label className="check">
                <input type="checkbox" checked={opts.collabFocus} onChange={(e) => setOptions({ collabFocus: e.target.checked })} /> 선택한 주체·활동 중심
              </label>
              <label>
                기여{' '}
                <select value={opts.collabContribution} onChange={(e) => setOptions({ collabContribution: e.target.value as typeof opts.collabContribution })}>
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
      </div>

      <div className="flow" role="tabpanel" aria-label={`${VIEWS.find(([id]) => id === view)![1]} 보기`}>
        <ReactFlow
          key={`${view}:${opts.timeMode}:${opts.collabContribution}:${opts.collabFocus ? selectedEntity : ''}`}
          nodes={rfNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          minZoom={0.2}
          maxZoom={2}
          nodesConnectable={false}
          elementsSelectable
          colorMode="system"
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => n.type === 'entity' && select({ kind: 'entity', id: n.id })}
          onEdgeClick={(_, e) => select({ kind: 'relation', id: (e.data as { relationId: Id }).relationId })}
          onPaneClick={() => select(null)}
          onNodeDragStop={(_, __, dragged) =>
            mapStore.getState().runView((d) => {
              const v = (d.views[view] ??= emptyView(view));
              for (const n of dragged) if (n.type === 'entity') v.positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
            })
          }
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} position="bottom-right" />
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

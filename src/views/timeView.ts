/**
 * 시간 보기: 어떻게 이어져 왔고, 어디로 이어질까?
 * - 시간층 배치: 해온 일 / 진행 중인 일 / 하려는 일 3열
 * - 날짜 배치: 실제(없으면 예정) 기간을 월 단위 축 위에 막대로. 날짜가 없으면 '날짜 미정' 열
 * 활동 간 연결과, 공통 기반 요인으로 가는 연결(하단 띠)을 보여준다.
 * 시간상 먼저라는 사실을 원인 관계로 바꾸지 않는다: 기여·영향 관계는 그리지 않는다.
 */
import type { Activity, Id, MapDocument, PartialDate, TimeLayer, ViewState } from '../domain/schema';
import { timeLayerOf } from '../domain/time';
import { activityLinkLabel, activityStatusLabel } from '../domain/vocab';
import {
  activitiesInTreeOrder,
  applySavedPositions,
  childCounts,
  edgesFor,
  NODE_H,
  NODE_W,
  visibleRepresentative,
  type Projection,
  type VNode,
} from './model';

export type TimeMode = 'layer' | 'date';

const LANES: [TimeLayer, string, string][] = [
  ['past', '해온 일', '지금도 이어지는 경험과 기반'],
  ['present', '진행 중인 일', '지금 힘을 쓰는 활동'],
  ['future', '하려는 일', '구상과 확장 방향'],
];
const LANE_W = NODE_W + 80;
const LANE_GAP = 60;
const ROW = NODE_H + 22;
const TOP = 70;
const MONTH_W = 36;

const monthIndex = (d: PartialDate) => d.y * 12 + ((d.m ?? 1) - 1);

/** 날짜 배치에 쓸 기간: 실제 기간 우선, 없으면 예정. */
export function datedSpan(a: Activity): { start: number; end?: number; tentative: boolean } | undefined {
  const r = a.actual?.start ? a.actual : a.planned?.start ? a.planned : undefined;
  if (!r?.start) return undefined;
  return { start: monthIndex(r.start), end: r.end ? monthIndex(r.end) : undefined, tentative: r !== a.actual };
}

export function hasDates(doc: MapDocument): boolean {
  return Object.values(doc.activities).some((a) => datedSpan(a));
}

export function projectTime(doc: MapDocument, view: ViewState | undefined, mode: TimeMode = 'layer'): Projection {
  const collapsed = view?.collapsed ?? [];
  const rep = visibleRepresentative(doc, collapsed);
  const counts = childCounts(doc);
  const order = activitiesInTreeOrder(doc).filter(({ id }) => rep(id) === id);
  const nodes: VNode[] = [];
  const notes: string[] = [];

  const entityNode = (a: Activity, x: number, y: number, w = NODE_W, tentative = false): VNode => ({
    kind: 'entity',
    id: a.id,
    entityType: 'activity',
    label: a.name,
    sub: activityStatusLabel[a.status] + (a.parentId && doc.activities[a.parentId] ? ` · ${doc.activities[a.parentId].name}의 하위` : ''),
    tone: timeLayerOf(a),
    x,
    y,
    w,
    h: NODE_H,
    childCount: counts.get(a.id) ?? 0,
    collapsed: collapsed.includes(a.id),
    tentative,
  });

  let bottom = TOP;
  let width = 0;

  if (mode === 'layer') {
    const rowsPerLane: Record<TimeLayer, number> = { past: 0, present: 0, future: 0 };
    for (const { id, depth } of order) {
      const a = doc.activities[id];
      const layer = timeLayerOf(a);
      const li = LANES.findIndex(([l]) => l === layer);
      const x = li * (LANE_W + LANE_GAP) + 40 + Math.min(depth, 2) * 12;
      const y = TOP + rowsPerLane[layer]++ * ROW;
      nodes.push(entityNode(a, x, y, NODE_W - Math.min(depth, 2) * 12));
    }
    const maxRows = Math.max(1, ...Object.values(rowsPerLane));
    bottom = TOP + maxRows * ROW;
    LANES.forEach(([layer, label, sub], i) =>
      nodes.unshift({ kind: 'lane', id: `lane:${layer}`, label, sub, tone: layer, x: i * (LANE_W + LANE_GAP), y: 0, w: LANE_W, h: bottom + 10 }),
    );
    width = LANES.length * (LANE_W + LANE_GAP) - LANE_GAP;
  } else {
    const spans = order.map(({ id }) => ({ a: doc.activities[id], span: datedSpan(doc.activities[id]) }));
    const dated = spans.filter((s) => s.span);
    const min = Math.min(...dated.map((s) => s.span!.start));
    const max = Math.max(...dated.map((s) => s.span!.end ?? s.span!.start + 3));
    const axisX = LANE_W + LANE_GAP; // 왼쪽 열은 '날짜 미정'
    let undated = 0;
    let datedRow = 0;
    spans.forEach(({ a, span }) => {
      if (!span) {
        nodes.push(entityNode(a, 40, TOP + undated++ * ROW, NODE_W));
        return;
      }
      const y = TOP + datedRow++ * ROW;
      const x = axisX + (span.start - min) * MONTH_W;
      const w = Math.max(NODE_W * 0.7, ((span.end ?? span.start + 3) - span.start + 1) * MONTH_W);
      nodes.push(entityNode(a, x, y, w, span.tentative));
    });
    bottom = TOP + Math.max(datedRow, undated, 1) * ROW;
    nodes.unshift({ kind: 'lane', id: 'lane:undated', label: '날짜 미정', sub: '시간층으로만 기록된 활동', tone: 'past', x: 0, y: 0, w: LANE_W, h: bottom + 10 });
    // 연도 눈금
    for (let y = Math.floor(min / 12); y <= Math.floor(max / 12); y++) {
      const x = axisX + (y * 12 - min) * MONTH_W;
      nodes.unshift({ kind: 'lane', id: `lane:year:${y}`, label: `${y}`, tone: 'present', x: Math.max(axisX, x), y: 0, w: 12 * MONTH_W - 4, h: bottom + 10 });
    }
    width = axisX + (max - min + 1) * MONTH_W;
    if (dated.some((s) => s.span!.tentative)) notes.push('점선 테두리는 실제 기간 없이 예정 기간으로 배치한 활동입니다.');
  }

  const visible = new Set(nodes.filter((n) => n.kind === 'entity').map((n) => n.id));

  // 공통 기반 요인 (G3): 하단 띠
  const bases = Object.values(doc.factors).filter((f) => f.sharedBase);
  if (bases.length) {
    const bandY = bottom + 50;
    nodes.push({ kind: 'lane', id: 'lane:base', label: '공통 기반', sub: '여러 활동이 함께 쓰는 자원', tone: 'base', x: 0, y: bandY, w: Math.max(width, LANE_W), h: NODE_H + 70 });
    bases.forEach((f, i) => {
      nodes.push({
        kind: 'entity',
        id: f.id,
        entityType: 'factor',
        label: f.name,
        sub: f.definition,
        tone: 'base',
        x: 40 + i * (NODE_W * 1.6 + 40),
        y: bandY + 50,
        w: NODE_W * 1.6,
        h: NODE_H,
      });
      visible.add(f.id);
    });
  }

  const rels = Object.values(doc.relations).filter(
    (r) => r.kind === 'activityLink' || (r.kind === 'factorLink' && doc.factors[r.to]?.sharedBase),
  );
  const edges = edgesFor(rels, rep, visible, (r) =>
    r.kind === 'factorLink'
      ? { tone: 'factor', label: r.description, directed: true }
      : {
          tone: 'link',
          label: r.description ?? activityLinkLabel[r.subtype as keyof typeof activityLinkLabel],
          directed: r.subtype !== 'compete' && r.subtype !== 'shareResource',
        },
  );

  return { nodes: applySavedPositions(nodes, view), edges, notes };
}

export const timeLaneIds = LANES.map(([l]) => `lane:${l}` as Id);

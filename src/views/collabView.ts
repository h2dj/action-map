/**
 * 협력 보기: 누가 어떤 역할로 참여하고 무엇을 제공할까?
 * - 전체: 주체(왼쪽) — 활동(오른쪽), 참여 관계에 역할·기여를 표시
 * - 초점: 선택한 활동의 참여 주체, 또는 선택한 주체의 참여 활동만 펼침
 * 연결 수를 업무 부담 점수로 표시하지 않는다.
 */
import type { ContributionKind, Id, MapDocument, Relation, ViewState } from '../domain/schema';
import { timeLayerOf } from '../domain/time';
import { activityStatusLabel, contributionKindLabel } from '../domain/vocab';
import { applySavedPositions, childCounts, edgesFor, NODE_H, NODE_W, visibleRepresentative, type Projection, type VNode } from './model';

export type CollabOptions = {
  /** 이 대상(주체 또는 활동)을 중심으로 펼친다 */
  focusId?: Id;
  /** 이 기여 종류가 있는 참여만 */
  contribution?: ContributionKind;
};

const COL_GAP = 420;
const ROW = NODE_H + 26;
const TOP = 70;

export function roleLabel(r: Relation): string {
  const role = r.role?.name ?? '참여';
  const kinds = [...new Set((r.contributions ?? []).map((c) => contributionKindLabel[c.kind]))];
  return kinds.length ? `${role} · ${kinds.join('·')}` : role;
}

/** 순서 다듬기: 반대편 이웃의 평균 위치(무게중심)로 정렬해 선 교차를 줄인다 */
function barycenterOrder(ids: Id[], neighborsOf: (id: Id) => Id[], indexOf: Map<Id, number>): Id[] {
  const score = (id: Id) => {
    const ns = neighborsOf(id).map((n) => indexOf.get(n)).filter((v): v is number => v !== undefined);
    return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : Number.MAX_SAFE_INTEGER;
  };
  return [...ids].sort((a, b) => score(a) - score(b));
}

export function projectCollab(doc: MapDocument, view: ViewState | undefined, opts: CollabOptions = {}): Projection {
  const notes: string[] = [];
  const collapsed = view?.collapsed ?? [];
  const rep = visibleRepresentative(doc, collapsed);
  const counts = childCounts(doc);

  let parts = Object.values(doc.relations).filter((r) => r.kind === 'participation');
  if (opts.contribution) parts = parts.filter((r) => r.contributions?.some((c) => c.kind === opts.contribution));

  const focus = opts.focusId;
  const focusIsActor = !!(focus && doc.actors[focus]);
  const focusIsActivity = !!(focus && doc.activities[focus]);
  if (focusIsActor) parts = parts.filter((r) => r.from === focus);
  if (focusIsActivity) parts = parts.filter((r) => rep(r.to) === rep(focus!));

  const actorIds = [...new Set(parts.map((r) => r.from))];
  const activityIds = [...new Set(parts.map((r) => rep(r.to)))];
  if (!focus) {
    // 참여가 없는 주체도 보이게 (빈틈 발견용)
    for (const a of Object.keys(doc.actors)) if (!actorIds.includes(a) && !opts.contribution) actorIds.push(a);
    const none = Object.keys(doc.activities).filter((id) => rep(id) === id && !activityIds.includes(id));
    if (none.length && !opts.contribution) notes.push(`참여 주체가 기록되지 않은 활동 ${none.length}개는 이 보기에 나타나지 않습니다.`);
  }

  const actorNeighbors = (id: Id) => parts.filter((r) => r.from === id).map((r) => rep(r.to));
  const activityNeighbors = (id: Id) => parts.filter((r) => rep(r.to) === id).map((r) => r.from);
  const actorOrder0 = actorIds;
  const actIndex0 = new Map(activityIds.map((id, i) => [id, i]));
  const actorOrder = barycenterOrder(actorOrder0, actorNeighbors, actIndex0);
  const actorIndex = new Map(actorOrder.map((id, i) => [id, i]));
  const activityOrder = barycenterOrder(activityIds, activityNeighbors, actorIndex);

  const actorCol = focusIsActivity ? 0 : 0;
  const activityCol = COL_GAP;
  const rows = Math.max(actorOrder.length, activityOrder.length, 1);
  const centerOffset = (n: number) => ((rows - n) * ROW) / 2;

  const nodes: VNode[] = [
    { kind: 'lane', id: 'lane:actors', label: '주체', sub: '사람·단체', tone: 'actor', x: actorCol - 20, y: 0, w: NODE_W + 40, h: TOP + rows * ROW },
    { kind: 'lane', id: 'lane:activities', label: '활동', sub: '역할과 기여는 선 위에', tone: 'present', x: activityCol - 20, y: 0, w: NODE_W + 40, h: TOP + rows * ROW },
  ];
  actorOrder.forEach((id, i) => {
    const a = doc.actors[id];
    nodes.push({
      kind: 'entity',
      id,
      entityType: 'actor',
      label: a.name,
      sub: a.kind === 'person' ? '사람' : '단체',
      tone: 'actor',
      x: actorCol,
      y: TOP + centerOffset(actorOrder.length) + i * ROW,
      w: NODE_W,
      h: NODE_H,
    });
  });
  activityOrder.forEach((id, i) => {
    const a = doc.activities[id];
    nodes.push({
      kind: 'entity',
      id,
      entityType: 'activity',
      label: a.name,
      sub: activityStatusLabel[a.status],
      tone: timeLayerOf(a),
      x: activityCol,
      y: TOP + centerOffset(activityOrder.length) + i * ROW,
      w: NODE_W,
      h: NODE_H,
      childCount: counts.get(id) ?? 0,
      collapsed: collapsed.includes(id),
    });
  });

  const visible = new Set([...actorOrder, ...activityOrder]);
  const edges = edgesFor(parts, rep, visible, (r) => ({ tone: 'role', label: roleLabel(r), directed: true }));
  // 주체 간 관계 (소속·협약)
  const actorLinks = Object.values(doc.relations).filter((r) => r.kind === 'actorLink');
  edges.push(...edgesFor(actorLinks, (x) => x, visible, (r) => ({ tone: 'actor', label: r.subtype, directed: false })));

  if (focus && !visible.has(rep(focus))) notes.push('선택한 대상은 참여 관계가 없어 초점 보기에 나타나지 않습니다.');
  return { nodes: applySavedPositions(nodes, focus ? undefined : view), edges, notes };
}

/**
 * 목적 보기: 어떤 변화와 가치에 기여할까?
 * 활동 → 직접적인 변화(필요하면 여러 단계) → 목적. 열은 기여 경로의 최장 길이로 정한다 (G5).
 * '다른 활동을 가능하게 하는 기여'(G4)는 별도 색의 점선으로 구분한다.
 */
import type { Id, MapDocument, ViewState } from '../domain/schema';
import { timeLayerOf } from '../domain/time';
import { activityStatusLabel } from '../domain/vocab';
import { applySavedPositions, childCounts, edgesFor, NODE_H, NODE_W, visibleRepresentative, type NodeTone, type Projection, type VNode } from './model';

const COL_GAP = 340;
const ROW = NODE_H + 30;
const TOP = 80;

export function projectPurpose(doc: MapDocument, view: ViewState | undefined): Projection {
  const notes: string[] = [];
  const collapsed = view?.collapsed ?? [];
  const rep = visibleRepresentative(doc, collapsed);
  const counts = childCounts(doc);
  const contribs = Object.values(doc.relations).filter((r) => r.kind === 'contribution');

  // 열 계산: 활동 0, 변화는 1 + 앞선 변화의 열(최장 경로), 목적은 마지막 열
  const col = new Map<Id, number>();
  const activities = [...new Set(contribs.filter((r) => doc.activities[r.from]).map((r) => rep(r.from)))];
  for (const a of activities) col.set(a, 0);
  const changes = Object.values(doc.outcomes).filter((o) => o.level === 'change').map((o) => o.id);
  const purposes = Object.values(doc.outcomes).filter((o) => o.level === 'purpose').map((o) => o.id);
  for (const c of changes) col.set(c, 1);
  for (let pass = 0; pass < changes.length; pass++) {
    let changed = false;
    for (const r of contribs) {
      if (!doc.outcomes[r.from] || doc.outcomes[r.to]?.level !== 'change') continue;
      const next = (col.get(r.from) ?? 1) + 1;
      if (next > (col.get(r.to) ?? 1) && next <= changes.length) {
        col.set(r.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const lastChangeCol = Math.max(1, ...changes.map((c) => col.get(c) ?? 1));
  const purposeCol = lastChangeCol + 1;
  for (const p of purposes) col.set(p, purposeCol);

  const unlinked = Object.keys(doc.activities).filter((id) => rep(id) === id && !activities.includes(id)).length;
  if (unlinked) notes.push(`변화·목적과의 기여가 기록되지 않은 활동 ${unlinked}개는 이 보기에 나타나지 않습니다.`);

  // 열 안의 순서: 앞 열 이웃의 무게중심
  const columns: Id[][] = Array.from({ length: purposeCol + 1 }, () => []);
  for (const [id, c] of col) columns[c].push(id);
  const index = new Map<Id, number>();
  columns[0].forEach((id, i) => index.set(id, i));
  const preds = (id: Id) => contribs.filter((r) => r.to === id).map((r) => rep(r.from));
  const succs = (id: Id) => contribs.filter((r) => rep(r.from) === id).map((r) => r.to);
  const sortBy = (ids: Id[], nb: (id: Id) => Id[]) => {
    const score = (id: Id) => {
      const v = nb(id).map((n) => index.get(n)).filter((x): x is number => x !== undefined);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : Number.MAX_SAFE_INTEGER;
    };
    return [...ids].sort((a, b) => score(a) - score(b));
  };
  for (let sweep = 0; sweep < 2; sweep++) {
    for (let c = 1; c < columns.length; c++) {
      columns[c] = sortBy(columns[c], preds);
      columns[c].forEach((id, i) => index.set(id, i));
    }
    for (let c = columns.length - 2; c >= 0; c--) {
      columns[c] = sortBy(columns[c], succs);
      columns[c].forEach((id, i) => index.set(id, i));
    }
  }

  const rows = Math.max(1, ...columns.map((c) => c.length));
  const headers = ['활동', ...Array.from({ length: lastChangeCol }, (_, i) => (i === 0 ? '직접적인 변화' : `이어지는 변화 ${i + 1}`)), '목적'];
  const subs = ['무엇을 하는가?', ...Array.from({ length: lastChangeCol }, () => '누구에게 어떤 변화가 생기는가?'), '그 변화는 왜 중요한가?'];
  const tones: NodeTone[] = ['present', ...Array.from({ length: lastChangeCol }, (): NodeTone => 'change'), 'purpose'];
  const nodes: VNode[] = headers.map((label, c): VNode => ({
    kind: 'lane',
    id: `lane:col${c}`,
    label,
    sub: subs[c],
    tone: tones[c],
    x: c * COL_GAP - 20,
    y: 0,
    w: NODE_W + 40,
    h: TOP + rows * ROW,
  }));

  columns.forEach((ids, c) =>
    ids.forEach((id, i) => {
      const y = TOP + ((rows - ids.length) * ROW) / 2 + i * ROW;
      const a = doc.activities[id];
      if (a) {
        nodes.push({
          kind: 'entity',
          id,
          entityType: 'activity',
          label: a.name,
          sub: activityStatusLabel[a.status],
          tone: timeLayerOf(a),
          x: c * COL_GAP,
          y,
          w: NODE_W,
          h: NODE_H,
          childCount: counts.get(id) ?? 0,
          collapsed: collapsed.includes(id),
        });
      } else {
        const o = doc.outcomes[id];
        nodes.push({ kind: 'entity', id, entityType: 'outcome', label: o.name, sub: o.target ?? o.description, tone: o.level, x: c * COL_GAP, y, w: NODE_W, h: NODE_H });
      }
    }),
  );

  const visible = new Set([...col.keys()]);
  const edges = edgesFor(contribs, rep, visible, (r) => ({
    tone: r.enabling ? 'enabling' : 'contribution',
    label: r.enabling ? `기반${r.description ? ` · ${r.description}` : ''}` : r.description,
    directed: true,
  }));
  if (contribs.some((r) => r.enabling)) notes.push('갈색 점선은 운영·재원·회복처럼 다른 활동을 가능하게 하는 기여입니다.');
  return { nodes: applySavedPositions(nodes, view), edges, notes };
}

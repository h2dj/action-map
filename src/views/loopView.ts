/**
 * 순환 보기 (2단계): 어떤 영향이 되돌아와 상황을 강화하거나 조절할까?
 * 변화 요인과 요인 사이의 영향(+/−/미정, 지연)을 그리고, 사용자가 구성한 순환에
 * R(강화)·B(균형) 라벨을 붙인다. 활동 간 연결을 인과관계로 바꾸지 않는다.
 * SysMap에서 가져온 위치(views.loop.positions)가 있으면 그대로 쓴다.
 */
import { analyzeLoop } from '../domain/loops';
import type { Id, MapDocument, ViewState } from '../domain/schema';
import { timeLayerOf } from '../domain/time';
import { applySavedPositions, NODE_H, type Projection, type VEdge, type VNode } from './model';

export type LoopOptions = {
  /** 요인과 연결된 활동·변화도 보여줄지 */
  showLinked?: boolean;
};

const FACTOR_W = 190;
const LOOP_H = 34;
/** 라벨 길이에 맞춘 순환 라벨 폭 (한글 기준 대략 14px/자) */
const loopWidth = (label: string) => Math.max(72, label.length * 14 + 28);

const center = (n: { x: number; y: number; w: number; h: number }) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

export function projectLoop(doc: MapDocument, view: ViewState | undefined, opts: LoopOptions = {}): Projection {
  const notes: string[] = [];
  const loops = Object.values(doc.loops);

  // 순환에 든 요인을 먼저, 순환 순서대로 원 둘레에 놓는다
  const order: Id[] = [];
  for (const l of loops) for (const f of l.factorIds) if (!order.includes(f) && doc.factors[f]) order.push(f);
  for (const f of Object.keys(doc.factors)) if (!order.includes(f)) order.push(f);
  if (!order.length) notes.push('변화 요인이 없습니다. “+ 요인”으로 늘거나 줄 수 있는 요소를 추가하세요.');

  const radius = Math.max(220, (order.length * (FACTOR_W + 40)) / (2 * Math.PI));
  const cx = radius + FACTOR_W;
  const cy = radius + NODE_H;
  const factorNodes: VNode[] = order.map((id, i) => {
    const f = doc.factors[id];
    const angle = (2 * Math.PI * i) / order.length - Math.PI / 2;
    return {
      kind: 'entity',
      id,
      entityType: 'factor',
      label: f.name,
      sub: f.increaseMeans ? `↑ ${f.increaseMeans}` : '증가의 의미를 적어 주세요',
      tone: f.sharedBase ? 'base' : 'factor',
      x: Math.round(cx + radius * Math.cos(angle) - FACTOR_W / 2),
      y: Math.round(cy + radius * Math.sin(angle) - NODE_H / 2),
      w: FACTOR_W,
      h: NODE_H,
    };
  });
  // 저장된 위치를 먼저 반영해야 순환 라벨·활동 배치가 그 위치를 따른다
  const placedFactors = applySavedPositions(factorNodes, view);
  const pos = new Map(placedFactors.map((n) => [n.id, n]));
  const nodes: VNode[] = [...placedFactors];
  const visible = new Set(order);

  // 요인과 연결된 활동·변화: 연결된 요인의 바깥쪽에
  const links = Object.values(doc.relations).filter((r) => r.kind === 'factorLink' && visible.has(r.to));
  if (opts.showLinked) {
    const placed = new Map<Id, number>();
    for (const r of links) {
      if (visible.has(r.from)) continue;
      const f = pos.get(r.to);
      if (!f) continue;
      const c = center(f);
      const dx = c.x - cx;
      const dy = c.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      const k = placed.get(r.to) ?? 0;
      placed.set(r.to, k + 1);
      const a = doc.activities[r.from];
      const o = doc.outcomes[r.from];
      nodes.push({
        kind: 'entity',
        id: r.from,
        entityType: a ? 'activity' : 'outcome',
        label: a?.name ?? o?.name ?? r.from,
        sub: a ? '활동' : '변화',
        tone: a ? timeLayerOf(a) : 'change',
        x: Math.round(c.x + (dx / len) * 230 - FACTOR_W / 2 + k * 24),
        y: Math.round(c.y + (dy / len) * 150 - NODE_H / 2 + k * (NODE_H + 10)),
        w: FACTOR_W,
        h: NODE_H,
      });
      visible.add(r.from);
    }
  } else if (links.length) {
    notes.push(`요인과 연결된 활동·변화 ${new Set(links.map((r) => r.from)).size}개는 “활동 함께 보기”로 볼 수 있습니다.`);
  }

  // 순환 라벨
  for (const l of loops) {
    const members = l.factorIds.map((f) => pos.get(f)).filter((n): n is VNode => !!n);
    if (!members.length) continue;
    const cs = members.map(center);
    const mx = cs.reduce((s, p) => s + p.x, 0) / cs.length;
    const my = cs.reduce((s, p) => s + p.y, 0) / cs.length;
    const kind = analyzeLoop(doc, l.factorIds).kind;
    const icon = kind === 'R' ? '↻' : kind === 'B' ? '↺' : kind === 'broken' ? '⚠' : '?';
    const saved = view?.positions[l.id];
    const label = `${icon} ${l.name}`;
    const LOOP_W = loopWidth(label);
    nodes.push({
      kind: 'loop',
      id: l.id,
      label,
      loopKind: kind,
      x: saved?.x ?? Math.round(mx - LOOP_W / 2),
      y: saved?.y ?? Math.round(my - LOOP_H / 2),
      w: LOOP_W,
      h: LOOP_H,
    });
  }

  const edges: VEdge[] = [];
  for (const r of Object.values(doc.relations)) {
    if (r.kind === 'influence' && visible.has(r.from) && visible.has(r.to)) {
      const sign = r.influence?.sign ?? '?';
      edges.push({
        id: r.id,
        relationId: r.id,
        source: r.from,
        target: r.to,
        status: r.status,
        evidence: r.evidence,
        tone: 'influence',
        sign,
        delayed: !!r.influence?.delayed,
        label: `${sign === '-' ? '−' : sign}${r.influence?.delayed ? ' ‖' : ''}`,
        directed: true,
      });
    } else if (r.kind === 'factorLink' && opts.showLinked && visible.has(r.from) && visible.has(r.to)) {
      const sign = r.influence?.sign;
      edges.push({
        id: r.id,
        relationId: r.id,
        source: r.from,
        target: r.to,
        status: r.status,
        evidence: r.evidence,
        tone: 'factor',
        sign,
        label: sign ? (sign === '-' ? '−' : sign) : undefined,
        directed: true,
      });
    }
  }
  if (Object.values(doc.relations).some((r) => r.kind === 'influence' && r.influence?.sign === '?'))
    notes.push('“?”는 방향을 아직 정하지 않은 영향입니다. 이런 영향이 든 순환은 강화·균형을 판정하지 않습니다.');
  notes.push('+는 함께 늘고 함께 주는 방향, −는 반대 방향입니다. 좋고 나쁨의 표시가 아닙니다. ‖는 지연입니다.');

  return { nodes, edges, notes };
}

/** 순환 하나에 속한 영향 관계 ID (강조용) */
export function loopRelationIds(doc: MapDocument, loopId: Id): Id[] {
  const l = doc.loops[loopId];
  if (!l) return [];
  return analyzeLoop(doc, l.factorIds)
    .steps.map((s) => s.relationId)
    .filter((x): x is Id => !!x);
}

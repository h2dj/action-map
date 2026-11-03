/**
 * SysMap(h2dj/sysmap) 연동 (G7).
 *
 * SysMap은 인과 지도(시스템 사고 지도)를 자유롭게 그리는 기존 도구다. 활동 지도는
 * 변화 요인과 영향 관계를 구조화된 기록으로 보관하고, 그림 다듬기·시스템 원형·
 * 문장으로 그리기 같은 작업은 SysMap에 맡긴다. 두 도구는 SysMap JSON으로 주고받는다.
 *
 * SysMap JSON: { title, nodes: [{ id, shape, label, x, y, w, h, fill, stroke, tags?, loopType? }],
 *                edges: [{ id, from, to, label, dashed, arrowStart, arrowEnd, bend, delay, polarity, bubble, color }] }
 *
 * - 내보내기: 변화 요인 → 텍스트 노드(공통 기반은 사각형), 요인과 연결된 활동 → 원 노드.
 *   영향·요인 연결 → 극성(+/−)·지연이 있는 연결선. 만들고 싶은 연결은 파선.
 *   노드에 `action-map:<ID>` 태그를 붙여 되돌아올 때 같은 기록으로 찾는다.
 * - 가져오기: 태그가 있는 노드는 기존 기록과 연결하고, 없는 노드는 새 변화 요인으로 만든다.
 *   이름이 같다는 이유로 합치지 않는다. 루프 라벨·말풍선은 기록으로 옮기지 않고 알린다.
 *   기존 관계와 이름은 덮어쓰지 않고 차이만 알린다.
 */
import { z } from 'zod';
import { newId } from '../domain/ids';
import { addFactor, addRelation } from '../domain/ops';
import type { Id, InfluenceSign, MapDocument, Relation } from '../domain/schema';
import type { Issue } from '../domain/validate';

export const TAG_PREFIX = 'action-map:';

const SysmapNode = z
  .object({
    id: z.string(),
    shape: z.string(),
    label: z.string().optional().default(''),
    x: z.number(),
    y: z.number(),
    w: z.number().optional(),
    h: z.number().optional(),
    tags: z.array(z.string()).optional(),
    loopType: z.string().optional(),
  })
  .passthrough();

const SysmapEdge = z
  .object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
    dashed: z.boolean().optional(),
    delay: z.boolean().optional(),
    polarity: z.string().optional(),
    bubble: z.boolean().optional(),
  })
  .passthrough();

export const SysmapState = z.object({
  title: z.string().optional(),
  nodes: z.array(SysmapNode),
  edges: z.array(SysmapEdge),
});
export type SysmapState = z.infer<typeof SysmapState>;
export type SysmapNode = z.infer<typeof SysmapNode>;
export type SysmapEdge = z.infer<typeof SysmapEdge>;

// ── 내보내기 ─────────────────────────────────────────────────────────────────

const NODE_STYLE = {
  text: { fill: 'transparent', stroke: '#1c2128', textColor: '#1c2128' },
  rect: { fill: '#eef2ff', stroke: '#4f6df5' },
  circle: { fill: '#e8f5f0', stroke: '#2f7d66' },
} as const;

function sizeFor(shape: 'text' | 'rect' | 'circle', label: string) {
  if (shape === 'text') return { w: Math.max(60, Math.min(220, label.length * 14 + 20)), h: label.length * 14 + 20 > 220 ? 50 : 30 };
  if (shape === 'circle') return { w: 120, h: 120 };
  return { w: 160, h: 90 };
}

const signToPolarity = (s: InfluenceSign | undefined) => (s === '+' || s === '-' ? s : '');

export type SysmapExportOptions = {
  /** 요인과 연결된 활동·변화도 함께 내보낼지 (기본 true) */
  includeLinkedEntities?: boolean;
};

export function toSysmap(doc: MapDocument, opts: SysmapExportOptions = {}): SysmapState {
  const includeLinked = opts.includeLinkedEntities ?? true;
  const rels = Object.values(doc.relations).filter(
    (r) => r.kind === 'influence' || (includeLinked && r.kind === 'factorLink'),
  );
  const ids: Id[] = [...Object.keys(doc.factors)];
  if (includeLinked) for (const r of rels) if (r.kind === 'factorLink' && !ids.includes(r.from)) ids.push(r.from);

  const saved = doc.views.loop?.positions ?? {};
  const radius = Math.max(220, ids.length * 45);
  const nodes: SysmapNode[] = ids.map((id, i) => {
    const factor = doc.factors[id];
    const label = factor?.name ?? doc.activities[id]?.name ?? doc.outcomes[id]?.name ?? id;
    const shape: 'text' | 'rect' | 'circle' = factor ? (factor.sharedBase ? 'rect' : 'text') : 'circle';
    const { w, h } = sizeFor(shape, label);
    const angle = (2 * Math.PI * i) / Math.max(1, ids.length) - Math.PI / 2;
    const center = saved[id] ?? { x: 400 + radius * Math.cos(angle), y: 320 + radius * Math.sin(angle) };
    return {
      id: `n_${id}`,
      shape,
      label,
      x: Math.round(center.x - w / 2),
      y: Math.round(center.y - h / 2),
      w,
      h,
      ...NODE_STYLE[shape],
      tags: [`${TAG_PREFIX}${id}`],
    };
  });

  const edges: SysmapEdge[] = rels.map((r) => ({
    id: `e_${r.id}`,
    from: `n_${r.from}`,
    to: `n_${r.to}`,
    label: '',
    dashed: r.status === 'planned',
    arrowStart: false,
    arrowEnd: true,
    bend: 0,
    delay: !!r.influence?.delayed,
    polarity: signToPolarity(r.influence?.sign),
    bubble: false,
    color: '',
    tags: [`${TAG_PREFIX}${r.id}`],
  }));

  return { title: `${doc.workspace.name} — 변화 요인`, nodes, edges };
}

// ── 가져오기 ─────────────────────────────────────────────────────────────────

export type SysmapImportPlan = {
  /** 새로 만들 변화 요인 (SysMap 노드 ID → 새 요인) */
  newFactors: { nodeId: string; id: Id; name: string; sharedBase: boolean }[];
  /** 새로 만들 관계 */
  newRelations: Omit<Relation, 'id'>[];
  /** 보기 위치 (순환 보기) */
  positions: Record<Id, { x: number; y: number }>;
  issues: Issue[];
};

const info = (code: string, message: string): Issue => ({ level: 'warning', code, message });

export function parseSysmap(text: string): { ok: true; state: SysmapState } | { ok: false; issues: Issue[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, issues: [{ level: 'error', code: 'sysmap.json', message: 'JSON 형식이 아닙니다.' }] };
  }
  const parsed = SysmapState.safeParse(raw);
  if (!parsed.success)
    return { ok: false, issues: [{ level: 'error', code: 'sysmap.format', message: 'SysMap 지도 파일(nodes·edges)이 아닙니다.' }] };
  return { ok: true, state: parsed.data };
}

/** SysMap 지도를 현재 문서에 더할 계획을 세운다. 문서는 바꾸지 않는다. */
export function planSysmapImport(doc: MapDocument, state: SysmapState): SysmapImportPlan {
  const issues: Issue[] = [];
  const nodeToId = new Map<string, Id>();
  const newFactors: SysmapImportPlan['newFactors'] = [];
  const positions: SysmapImportPlan['positions'] = {};
  const nodeById = new Map(state.nodes.map((n) => [n.id, n]));
  let skippedLoops = 0;
  let skippedBubbles = 0;

  for (const n of state.nodes) {
    if (n.shape === 'loop') {
      skippedLoops++;
      continue;
    }
    if (n.shape === 'bubble') {
      skippedBubbles++;
      continue;
    }
    const tagged = n.tags?.find((t) => t.startsWith(TAG_PREFIX))?.slice(TAG_PREFIX.length);
    const label = n.label.trim();
    let id: Id | undefined;
    if (tagged && (doc.factors[tagged] || doc.activities[tagged] || doc.outcomes[tagged])) {
      id = tagged;
      const current = doc.factors[tagged]?.name ?? doc.activities[tagged]?.name ?? doc.outcomes[tagged]?.name;
      if (label && current !== label)
        issues.push(info('sysmap.renamed', `“${current}”이(가) SysMap에서 “${label}”(으)로 바뀌어 있습니다. 이름은 바꾸지 않았습니다.`));
    } else {
      if (!label) {
        issues.push(info('sysmap.emptyLabel', '이름이 없는 노드는 건너뛰었습니다.'));
        continue;
      }
      id = newId('factor');
      newFactors.push({ nodeId: n.id, id, name: label, sharedBase: n.shape === 'rect' });
    }
    nodeToId.set(n.id, id);
    positions[id] = { x: Math.round(n.x + (n.w ?? 0) / 2), y: Math.round(n.y + (n.h ?? 0) / 2) };
  }
  if (skippedLoops) issues.push(info('sysmap.loopLabels', `루프 라벨 ${skippedLoops}개는 옮기지 않았습니다. 순환은 영향 관계에서 다시 판정합니다.`));
  if (skippedBubbles) issues.push(info('sysmap.bubbles', `말풍선 ${skippedBubbles}개는 옮기지 않았습니다.`));

  const isFactor = (id: Id) => !!doc.factors[id] || newFactors.some((f) => f.id === id);
  const isLinkable = (id: Id) => !!doc.activities[id] || !!doc.outcomes[id];
  const existing = new Set(
    Object.values(doc.relations)
      .filter((r) => r.kind === 'influence' || r.kind === 'factorLink')
      .map((r) => `${r.from}>${r.to}`),
  );
  const newRelations: SysmapImportPlan['newRelations'] = [];

  for (const e of state.edges) {
    if (e.bubble) continue;
    const from = nodeToId.get(e.from);
    const to = nodeToId.get(e.to);
    if (!from || !to) continue; // 루프 라벨·말풍선·빈 노드와 이어진 선
    const name = (nid: string) => nodeById.get(nid)?.label || nid;
    if (from === to) {
      issues.push(info('sysmap.selfLoop', `자기 참조 연결(“${name(e.from)}”)은 옮기지 않았습니다.`));
      continue;
    }
    if (existing.has(`${from}>${to}`)) continue; // 이미 있는 관계는 그대로 둔다
    const sign: InfluenceSign = e.polarity === '+' || e.polarity === '-' ? e.polarity : '?';
    const influence = { sign, ...(e.delay ? { delayed: true } : {}) };
    const base = {
      from,
      to,
      status: e.dashed ? ('planned' as const) : ('active' as const),
      evidence: 'hypothesis' as const,
      influence,
      ...(e.label ? { description: e.label } : {}),
    };
    if (isFactor(from) && isFactor(to)) newRelations.push({ kind: 'influence', ...base });
    else if (isLinkable(from) && isFactor(to)) newRelations.push({ kind: 'factorLink', ...base });
    else {
      issues.push(info('sysmap.unsupportedEdge', `“${name(e.from)} → ${name(e.to)}” 연결은 요인으로 향하지 않아 옮기지 않았습니다.`));
      continue;
    }
    existing.add(`${from}>${to}`);
  }

  return { newFactors, newRelations, positions, issues };
}

/** 계획을 문서에 적용한다 (스토어 run 안에서 호출). */
export function applySysmapImport(doc: MapDocument, plan: SysmapImportPlan): void {
  for (const f of plan.newFactors) addFactor(doc, { id: f.id, name: f.name, ...(f.sharedBase ? { sharedBase: true } : {}) });
  for (const r of plan.newRelations) addRelation(doc, r);
  const view = (doc.views.loop ??= { viewId: 'loop', positions: {}, filters: {}, collapsed: [] });
  Object.assign(view.positions, plan.positions);
}

/**
 * 순환 분석 (2단계).
 * - 영향 부호: +는 한 요인이 늘 때 다른 요인도 느는 방향, −는 반대 방향. 좋고 나쁨이 아니다.
 * - 부호가 모두 정해진 닫힌 순환에서 − 개수가 짝수면 강화(R), 홀수면 균형(B).
 * - 부호가 하나라도 미정이면 판정하지 않는다. 판정은 관계의 타당성을 입증하지 않는다.
 * 순환은 사용자가 직접 구성한다. 자동 탐지는 후속 기능이다.
 */
import { newId } from './ids';
import { DomainError } from './ops';
import { Loop, ReviewNote, type Id, type InfluenceSign, type MapDocument, type Relation } from './schema';

export type LoopStep = {
  from: Id;
  to: Id;
  relationId?: Id;
  sign?: InfluenceSign;
  delayed: boolean;
};

export type LoopKind = 'R' | 'B' | 'undetermined' | 'broken';

export type LoopAnalysis = {
  kind: LoopKind;
  steps: LoopStep[];
  negatives: number;
  hasDelay: boolean;
  /** 영향 관계가 없는 구간 */
  missing: LoopStep[];
  /** 부호가 미정이거나, 같은 구간의 관계끼리 부호가 다른 구간 */
  unknown: LoopStep[];
};

export const loopKindLabel: Record<LoopKind, string> = {
  R: '강화 순환 (R)',
  B: '균형 순환 (B)',
  undetermined: '판정 보류 (부호 미정)',
  broken: '끊긴 순환 (영향 관계 없음)',
};

export const loopKindHelp: Record<LoopKind, string> = {
  R: '한 바퀴 돌면 처음 변화가 같은 방향으로 더 커집니다. 성장이나 악순환이 이어지는 구조일 수 있습니다.',
  B: '한 바퀴 돌면 처음 변화를 거스르는 방향으로 돌아옵니다. 변화를 억제하거나 조절하는 구조일 수 있습니다.',
  undetermined: '방향이 정해지지 않은 영향이 있어 강화·균형을 판정하지 않습니다. 영향 방향(+/−)을 정하면 다시 판정합니다.',
  broken: '이어지지 않은 구간이 있습니다. 해당 구간에 영향 관계를 추가하거나 순환을 다시 구성하세요.',
};

function influencesBetween(doc: MapDocument, from: Id, to: Id): Relation[] {
  return Object.values(doc.relations).filter((r) => r.kind === 'influence' && r.from === from && r.to === to);
}

export function analyzeLoop(doc: MapDocument, factorIds: Id[]): LoopAnalysis {
  const steps: LoopStep[] = factorIds.map((from, i) => {
    const to = factorIds[(i + 1) % factorIds.length];
    const rels = influencesBetween(doc, from, to);
    if (!rels.length) return { from, to, delayed: false };
    const signs = new Set(rels.map((r) => r.influence?.sign ?? '?'));
    const sign: InfluenceSign = signs.size === 1 ? [...signs][0] : '?';
    return { from, to, relationId: rels[0].id, sign, delayed: rels.some((r) => !!r.influence?.delayed) };
  });
  const missing = steps.filter((s) => !s.relationId);
  const unknown = steps.filter((s) => s.relationId && s.sign === '?');
  const negatives = steps.filter((s) => s.sign === '-').length;
  const kind: LoopKind = missing.length ? 'broken' : unknown.length ? 'undetermined' : negatives % 2 === 0 ? 'R' : 'B';
  return { kind, steps, negatives, hasDelay: steps.some((s) => s.delayed), missing, unknown };
}

/** 순환을 구성할 때 다음에 고를 수 있는 요인: 현재 요인에서 영향이 나가는 요인 */
export function nextFactors(doc: MapDocument, current: Id): { id: Id; sign: InfluenceSign }[] {
  return Object.values(doc.relations)
    .filter((r) => r.kind === 'influence' && r.from === current && doc.factors[r.to])
    .map((r) => ({ id: r.to, sign: r.influence?.sign ?? '?' }));
}

/** 마지막 요인에서 처음 요인으로 돌아오는 영향이 있으면 순환이 닫힌다 */
export function closesLoop(doc: MapDocument, factorIds: Id[]): boolean {
  return factorIds.length >= 2 && influencesBetween(doc, factorIds[factorIds.length - 1], factorIds[0]).length > 0;
}

const nameOf = (doc: MapDocument, id: Id) => doc.factors[id]?.name ?? doc.activities[id]?.name ?? doc.outcomes[id]?.name ?? id;

/**
 * 영향을 문장으로 풀어 쓴다. 증가의 의미가 적혀 있으면 함께 보여준다.
 * 예: "운영 업무량이(가) 늘면 회복 여력은(는) 줄어든다"
 */
export function influenceSentence(doc: MapDocument, from: Id, to: Id, sign: InfluenceSign | undefined): string {
  const a = nameOf(doc, from);
  const b = nameOf(doc, to);
  if (sign === '+') return `‘${a}’이(가) 늘면 ‘${b}’도 늘어난다 (줄면 함께 준다)`;
  if (sign === '-') return `‘${a}’이(가) 늘면 ‘${b}’은(는) 줄어든다 (줄면 오히려 는다)`;
  return `‘${a}’이(가) ‘${b}’에 영향을 주지만 방향은 아직 정하지 않았다`;
}

// ── 순환 기록 ────────────────────────────────────────────────────────────────

/** 시작점만 다른 같은 순환인지 (A→B→C 와 B→C→A) */
export function sameCycle(a: Id[], b: Id[]): boolean {
  if (a.length !== b.length) return false;
  const start = b.indexOf(a[0]);
  return start >= 0 && a.every((id, i) => b[(start + i) % b.length] === id);
}

function nextLoopName(doc: MapDocument, kind: LoopKind): string {
  const prefix = kind === 'R' || kind === 'B' ? kind : '순환';
  const used = new Set(Object.values(doc.loops).map((l) => l.name));
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

export function addLoop(doc: MapDocument, input: { factorIds: Id[]; name?: string; description?: string; id?: Id }): Id {
  const { factorIds } = input;
  if (factorIds.length < 2) throw new DomainError('순환에는 변화 요인이 둘 이상 필요합니다.');
  if (new Set(factorIds).size !== factorIds.length) throw new DomainError('같은 요인을 두 번 지날 수 없습니다.');
  for (const f of factorIds) if (!doc.factors[f]) throw new DomainError(`변화 요인이 아닙니다: ${f}`);
  if (Object.values(doc.loops).some((l) => sameCycle(l.factorIds, factorIds)))
    throw new DomainError('같은 경로의 순환이 이미 있습니다.');
  const analysis = analyzeLoop(doc, factorIds);
  if (analysis.kind === 'broken') throw new DomainError('영향 관계로 이어지지 않은 구간이 있어 순환을 만들 수 없습니다.');
  const loop = Loop.parse({
    id: input.id ?? newId('loop'),
    name: input.name?.trim() || nextLoopName(doc, analysis.kind),
    factorIds,
    ...(input.description ? { description: input.description } : {}),
  });
  if (doc.loops[loop.id]) throw new DomainError(`이미 사용 중인 ID입니다: ${loop.id}`);
  doc.loops[loop.id] = loop;
  return loop.id;
}

export function updateLoop(doc: MapDocument, id: Id, patch: { name?: string; description?: string }): void {
  const cur = doc.loops[id];
  if (!cur) throw new DomainError('순환을 찾을 수 없습니다.');
  const merged = { ...cur, ...patch };
  if (!merged.description) delete merged.description;
  doc.loops[id] = Loop.parse(merged);
}

export function deleteLoop(doc: MapDocument, id: Id): void {
  if (!doc.loops[id]) throw new DomainError('순환을 찾을 수 없습니다.');
  delete doc.loops[id];
  for (const rv of Object.values(doc.reviews)) rv.targetIds = rv.targetIds.filter((t) => t !== id);
  for (const v of Object.values(doc.views)) delete v.positions[id];
}

// ── 검토 기록: 판단과 후속 질문 ─────────────────────────────────────────────────

export function addReview(
  doc: MapDocument,
  input: { targetIds: Id[]; question?: string; judgment?: string; date?: string; sources?: string[] },
): Id {
  const question = input.question?.trim();
  const judgment = input.judgment?.trim();
  if (!question && !judgment) throw new DomainError('질문이나 판단 중 하나는 적어야 합니다.');
  const note = ReviewNote.parse({
    id: newId('review'),
    targetIds: input.targetIds,
    date: input.date ?? new Date().toISOString().slice(0, 10),
    ...(question ? { question } : {}),
    ...(judgment ? { judgment } : {}),
    ...(input.sources?.length ? { sources: input.sources } : {}),
  });
  doc.reviews[note.id] = note;
  return note.id;
}

export function updateReview(doc: MapDocument, id: Id, patch: { question?: string; judgment?: string }): void {
  const cur = doc.reviews[id];
  if (!cur) throw new DomainError('검토 기록을 찾을 수 없습니다.');
  const merged = { ...cur, ...patch };
  if (!merged.question) delete merged.question;
  if (!merged.judgment) delete merged.judgment;
  if (!merged.question && !merged.judgment) throw new DomainError('질문이나 판단 중 하나는 남겨야 합니다.');
  doc.reviews[id] = ReviewNote.parse(merged);
}

export function deleteReview(doc: MapDocument, id: Id): void {
  if (!doc.reviews[id]) throw new DomainError('검토 기록을 찾을 수 없습니다.');
  delete doc.reviews[id];
}

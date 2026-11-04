/**
 * 문서를 바꾸는 순수 연산. 모두 (가변) 문서 초안을 받아 직접 수정하며,
 * 스토어에서 immer 초안에 적용해 실행 취소 패치를 만든다.
 * 규칙 위반은 DomainError로 거부한다.
 */
import { entityTypeOf, newId } from './ids';
import {
  Activity,
  Actor,
  Factor,
  Outcome,
  Relation,
  SCHEMA_VERSION,
  type EntityType,
  type Id,
  type MapDocument,
} from './schema';
import { hasErrors, validateRelation, wouldCreateParentCycle, type Issue } from './validate';

export class DomainError extends Error {
  constructor(
    message: string,
    readonly issues: Issue[] = [],
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function createEmptyDocument(name: string, now = new Date().toISOString()): MapDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    workspace: { id: newId('workspace'), name, createdAt: now, updatedAt: now },
    actors: {},
    activities: {},
    outcomes: {},
    factors: {},
    relations: {},
    views: {},
    reviews: {},
    loops: {},
  };
}

// ── 엔티티 생성: 이름만으로 만들 수 있고 상세는 나중에 보완한다 (F01) ──────────

type NewInput<T> = Partial<Omit<T, 'id'>> & { name: string; id?: Id };

export function addActor(doc: MapDocument, input: NewInput<Actor>): Id {
  const actor = Actor.parse({ kind: 'person', ...input, id: input.id ?? newId('actor') });
  assertFreeId(doc, actor.id);
  doc.actors[actor.id] = actor;
  return actor.id;
}

export function addActivity(doc: MapDocument, input: NewInput<Activity>): Id {
  const activity = Activity.parse({ status: 'idea', ...input, id: input.id ?? newId('activity') });
  assertFreeId(doc, activity.id);
  if (activity.parentId !== undefined && !doc.activities[activity.parentId])
    throw new DomainError('상위 활동이 없습니다.');
  doc.activities[activity.id] = activity;
  return activity.id;
}

export function addOutcome(doc: MapDocument, input: NewInput<Outcome>): Id {
  const outcome = Outcome.parse({ level: 'change', ...input, id: input.id ?? newId('outcome') });
  assertFreeId(doc, outcome.id);
  doc.outcomes[outcome.id] = outcome;
  return outcome.id;
}

export function addFactor(doc: MapDocument, input: NewInput<Factor>): Id {
  const factor = Factor.parse({ ...input, id: input.id ?? newId('factor') });
  assertFreeId(doc, factor.id);
  doc.factors[factor.id] = factor;
  return factor.id;
}

function assertFreeId(doc: MapDocument, id: Id) {
  if (entityTypeOf(doc, id) || doc.relations[id] || doc.loops[id] || doc.reviews[id])
    throw new DomainError(`이미 사용 중인 ID입니다: ${id}`);
}

// ── 엔티티 수정: ID는 바뀌지 않으므로 이름을 바꿔도 연결이 유지된다 ─────────────

const schemaOf = { actor: Actor, activity: Activity, outcome: Outcome, factor: Factor } as const;
const collectionOf = (doc: MapDocument, type: EntityType) =>
  ({ actor: doc.actors, activity: doc.activities, outcome: doc.outcomes, factor: doc.factors })[type] as Record<
    Id,
    { id: Id }
  >;

export function updateEntity(doc: MapDocument, id: Id, patch: Record<string, unknown>): void {
  const type = entityTypeOf(doc, id);
  if (!type) throw new DomainError(`대상을 찾을 수 없습니다: ${id}`);
  if ('id' in patch && patch.id !== id) throw new DomainError('ID는 바꿀 수 없습니다.');
  if (type === 'activity' && 'parentId' in patch) {
    setParent(doc, id, patch.parentId as Id | undefined);
    const { parentId: _ignored, ...rest } = patch;
    patch = rest;
  }
  const col = collectionOf(doc, type);
  const merged = { ...col[id], ...patch };
  for (const [k, v] of Object.entries(merged)) if (v === undefined) delete (merged as Record<string, unknown>)[k];
  col[id] = schemaOf[type].parse(merged);
}

/** 포함 관계 변경 (F02). 자기 포함과 순환을 차단한다. undefined면 최상위로 뺀다. */
export function setParent(doc: MapDocument, childId: Id, parentId: Id | undefined): void {
  const child = doc.activities[childId];
  if (!child) throw new DomainError(`활동을 찾을 수 없습니다: ${childId}`);
  if (parentId === undefined) {
    delete child.parentId;
    return;
  }
  if (!doc.activities[parentId]) throw new DomainError('상위 활동이 없습니다.');
  if (wouldCreateParentCycle(doc, childId, parentId))
    throw new DomainError('자기 자신이나 하위 활동을 상위 활동으로 둘 수 없습니다.');
  child.parentId = parentId;
}

/** 하위 활동 전체(자손)를 깊이 우선으로 반환 */
export function descendantsOf(doc: MapDocument, id: Id): Id[] {
  const children = new Map<Id, Id[]>();
  for (const a of Object.values(doc.activities))
    if (a.parentId) children.set(a.parentId, [...(children.get(a.parentId) ?? []), a.id]);
  const out: Id[] = [];
  const walk = (cur: Id) => {
    for (const c of children.get(cur) ?? []) {
      out.push(c);
      walk(c);
    }
  };
  walk(id);
  return out;
}

// ── 관계 ─────────────────────────────────────────────────────────────────────

export type NewRelation = Omit<Relation, 'id' | 'status' | 'evidence'> &
  Partial<Pick<Relation, 'id' | 'status' | 'evidence'>>;

/** 관계 생성 (F03). 기본값: 현재 연결, 근거는 기대·가설. */
export function addRelation(doc: MapDocument, input: NewRelation): Id {
  const rel = Relation.parse({ status: 'active', evidence: 'hypothesis', ...input, id: input.id ?? newId('relation') });
  assertFreeId(doc, rel.id);
  const issues = validateRelation(doc, rel);
  if (hasErrors(issues)) throw new DomainError('관계를 만들 수 없습니다.', issues);
  doc.relations[rel.id] = rel;
  return rel.id;
}

export function updateRelation(doc: MapDocument, id: Id, patch: Partial<Relation>): void {
  const cur = doc.relations[id];
  if (!cur) throw new DomainError(`관계를 찾을 수 없습니다: ${id}`);
  if (patch.id !== undefined && patch.id !== id) throw new DomainError('ID는 바꿀 수 없습니다.');
  const merged = { ...cur, ...patch };
  for (const [k, v] of Object.entries(merged)) if (v === undefined) delete (merged as Record<string, unknown>)[k];
  const rel = Relation.parse(merged);
  const issues = validateRelation(doc, rel);
  if (hasErrors(issues)) throw new DomainError('관계를 수정할 수 없습니다.', issues);
  doc.relations[id] = rel;
}

export function deleteRelation(doc: MapDocument, id: Id): void {
  if (!doc.relations[id]) throw new DomainError(`관계를 찾을 수 없습니다: ${id}`);
  delete doc.relations[id];
  scrubReferences(doc, new Set([id]));
}

// ── 삭제: 영향을 먼저 보여주고, 하위 활동 처리 방식을 명시적으로 고른다 (F09) ──────

export type DeleteImpact = {
  target: Id;
  /** 하위 활동 (자손 전체) */
  descendants: Id[];
  /** 대상 자신에게 직접 연결된 관계 */
  relations: Id[];
  /** 자손까지 함께 지울 때 추가로 사라지는 관계 */
  descendantRelations: Id[];
  /** 대상을 가리키는 검토 기록 */
  reviews: Id[];
  /** 이 요인이 들어 있어 함께 사라지는 순환 */
  loops: Id[];
};

export function deleteImpact(doc: MapDocument, id: Id): DeleteImpact {
  if (!entityTypeOf(doc, id)) throw new DomainError(`대상을 찾을 수 없습니다: ${id}`);
  const descendants = doc.activities[id] ? descendantsOf(doc, id) : [];
  const desc = new Set(descendants);
  const relations: Id[] = [];
  const descendantRelations: Id[] = [];
  for (const r of Object.values(doc.relations)) {
    if (r.from === id || r.to === id) relations.push(r.id);
    else if (desc.has(r.from) || desc.has(r.to)) descendantRelations.push(r.id);
  }
  const reviews = Object.values(doc.reviews)
    .filter((rv) => rv.targetIds.includes(id))
    .map((rv) => rv.id);
  const loops = Object.values(doc.loops)
    .filter((l) => l.factorIds.includes(id))
    .map((l) => l.id);
  return { target: id, descendants, relations, descendantRelations, reviews, loops };
}

export type ChildMode = 'cascade' | 'detach';

/**
 * 엔티티 삭제. 하위 활동이 있으면 mode를 반드시 지정해야 한다.
 * - cascade: 하위 활동과 그 관계를 함께 삭제
 * - detach: 하위 활동은 남기고 상위 연결만 해제(최상위로 이동)
 */
export function deleteEntity(doc: MapDocument, id: Id, mode?: ChildMode): DeleteImpact {
  const impact = deleteImpact(doc, id);
  if (impact.descendants.length && !mode)
    throw new DomainError('하위 활동이 있습니다. 함께 삭제할지, 상위 연결만 해제할지 선택해야 합니다.');

  const removed = new Set<Id>([id, ...impact.relations, ...impact.loops]);
  for (const l of impact.loops) delete doc.loops[l];
  if (mode === 'cascade') {
    for (const d of impact.descendants) {
      delete doc.activities[d];
      removed.add(d);
    }
    for (const r of impact.descendantRelations) removed.add(r);
  } else {
    for (const a of Object.values(doc.activities)) if (a.parentId === id) delete a.parentId;
  }
  for (const r of removed) delete doc.relations[r];
  const type = entityTypeOf(doc, id)!;
  delete collectionOf(doc, type)[id];
  scrubReferences(doc, removed);
  return impact;
}

/** 지운 ID를 보기 상태·검토 기록에서 정리한다. 검토 기록 자체는 남긴다. */
function scrubReferences(doc: MapDocument, removed: Set<Id>): void {
  for (const v of Object.values(doc.views)) {
    for (const id of removed) delete v.positions[id];
    v.collapsed = v.collapsed.filter((c) => !removed.has(c));
    if (v.selected && removed.has(v.selected)) delete v.selected;
    if (v.focusId && removed.has(v.focusId)) delete v.focusId;
  }
  for (const rv of Object.values(doc.reviews)) rv.targetIds = rv.targetIds.filter((t) => !removed.has(t));
}

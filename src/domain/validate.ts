import { entityTypeOf } from './ids';
import { ActivityLinkSubtype, type Activity, type Id, type MapDocument, type Relation } from './schema';
import { isReversed } from './time';
import { relationEndpoints, relationKindLabel } from './vocab';

export type Issue = {
  level: 'error' | 'warning';
  code: string;
  message: string;
  targetId?: Id;
};

const err = (code: string, message: string, targetId?: Id): Issue => ({ level: 'error', code, message, targetId });
const warn = (code: string, message: string, targetId?: Id): Issue => ({ level: 'warning', code, message, targetId });

/** 관계 하나를 문서 기준으로 검증한다. 종류별 허용 끝점과 전용 필드를 확인한다. */
export function validateRelation(doc: MapDocument, rel: Relation): Issue[] {
  const issues: Issue[] = [];
  const label = relationKindLabel[rel.kind];
  const fromType = entityTypeOf(doc, rel.from);
  const toType = entityTypeOf(doc, rel.to);
  const allowed = relationEndpoints[rel.kind];

  if (!fromType) issues.push(err('relation.missingFrom', `${label}: 시작 대상(${rel.from})이 없습니다.`, rel.id));
  else if (!allowed.from.includes(fromType))
    issues.push(err('relation.badFrom', `${label}은(는) ${fromType}에서 시작할 수 없습니다.`, rel.id));

  if (!toType) issues.push(err('relation.missingTo', `${label}: 끝 대상(${rel.to})이 없습니다.`, rel.id));
  else if (!allowed.to.includes(toType))
    issues.push(err('relation.badTo', `${label}은(는) ${toType}(으)로 연결할 수 없습니다.`, rel.id));

  if (rel.from === rel.to) issues.push(err('relation.self', `${label}: 자기 자신과 연결할 수 없습니다.`, rel.id));

  if (rel.kind === 'participation' && !rel.role)
    issues.push(err('relation.roleRequired', '참여 관계에는 역할명이 필요합니다.', rel.id));
  if (rel.kind !== 'participation' && rel.role)
    issues.push(err('relation.roleNotAllowed', '역할은 참여 관계에만 기록합니다.', rel.id));

  if (rel.kind === 'activityLink' && !ActivityLinkSubtype.safeParse(rel.subtype).success)
    issues.push(err('relation.subtype', '활동 간 연결의 종류를 선택해야 합니다.', rel.id));

  if (rel.contributions?.length) {
    const ok = rel.kind === 'participation' || (rel.kind === 'activityLink' && rel.subtype === 'support');
    if (!ok) issues.push(err('relation.contributionNotAllowed', '기여 내역은 참여·지원 관계에만 붙입니다.', rel.id));
  }
  if (rel.enabling !== undefined && rel.kind !== 'contribution')
    issues.push(err('relation.enablingNotAllowed', '“다른 활동을 가능하게 하는 기여” 표시는 기여 관계에만 씁니다.', rel.id));
  if (rel.influence && rel.kind !== 'influence' && rel.kind !== 'factorLink')
    issues.push(err('relation.influenceNotAllowed', '영향 방향은 요인 관련 관계에만 기록합니다.', rel.id));
  if (rel.kind === 'influence' && !rel.influence)
    issues.push(err('relation.influenceRequired', '영향 관계에는 방향(+, −, 미정)이 필요합니다.', rel.id));

  if (isReversed(rel.validity)) issues.push(warn('relation.validityReversed', '유효 기간의 시작이 종료보다 늦습니다.', rel.id));
  return issues;
}

/** childId의 상위를 parentId로 바꾸면 포함 관계 순환이 생기는지 확인한다. */
export function wouldCreateParentCycle(doc: MapDocument, childId: Id, parentId: Id): boolean {
  let cur: Id | undefined = parentId;
  const seen = new Set<Id>();
  while (cur !== undefined) {
    if (cur === childId) return true;
    if (seen.has(cur)) return true; // 이미 깨진 데이터 방어
    seen.add(cur);
    cur = doc.activities[cur]?.parentId;
  }
  return false;
}

export function validateActivity(doc: MapDocument, a: Activity): Issue[] {
  const issues: Issue[] = [];
  if (a.parentId !== undefined) {
    if (!doc.activities[a.parentId]) issues.push(err('activity.missingParent', `상위 활동(${a.parentId})이 없습니다.`, a.id));
    else if (wouldCreateParentCycle(doc, a.id, a.parentId))
      issues.push(err('activity.parentCycle', '포함 관계가 순환합니다.', a.id));
  }
  if (isReversed(a.planned)) issues.push(warn('activity.plannedReversed', '예정 기간의 시작이 종료보다 늦습니다.', a.id));
  if (isReversed(a.actual)) issues.push(warn('activity.actualReversed', '실제 기간의 시작이 종료보다 늦습니다.', a.id));
  return issues;
}

/** 문서 전체 무결성 검사. 가져오기와 저장 전 확인에 쓴다. */
export function validateDocument(doc: MapDocument): Issue[] {
  const issues: Issue[] = [];
  const collections = [doc.actors, doc.activities, doc.outcomes, doc.factors, doc.relations, doc.reviews, doc.loops] as const;
  const seen = new Set<Id>();
  for (const col of collections) {
    for (const [key, item] of Object.entries(col)) {
      if (key !== item.id) issues.push(err('doc.keyMismatch', `키(${key})와 ID(${item.id})가 다릅니다.`, item.id));
      if (seen.has(item.id)) issues.push(err('doc.duplicateId', `중복 ID: ${item.id}`, item.id));
      seen.add(item.id);
    }
  }
  for (const a of Object.values(doc.activities)) issues.push(...validateActivity(doc, a));
  for (const r of Object.values(doc.relations)) issues.push(...validateRelation(doc, r));
  for (const l of Object.values(doc.loops)) {
    if (new Set(l.factorIds).size !== l.factorIds.length)
      issues.push(err('loop.duplicateFactor', `순환 “${l.name}”에 같은 요인이 두 번 들어 있습니다.`, l.id));
    for (const f of l.factorIds)
      if (!doc.factors[f]) issues.push(err('loop.missingFactor', `순환 “${l.name}”의 요인(${f})이 없습니다.`, l.id));
  }
  for (const rv of Object.values(doc.reviews))
    for (const t of rv.targetIds)
      if (!entityTypeOf(doc, t) && !doc.relations[t] && !doc.loops[t])
        issues.push(warn('review.missingTarget', `검토 기록이 없는 대상(${t})을 가리킵니다.`, rv.id));
  return issues;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === 'error');

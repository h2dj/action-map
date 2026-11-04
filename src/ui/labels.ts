import { entityName, entityTypeOf } from '../domain/ids';
import type { EntityType, Id, MapDocument, Relation } from '../domain/schema';
import { activityLinkLabel, relationKindLabel } from '../domain/vocab';

export const entityTypeLabel: Record<EntityType, string> = {
  actor: '주체',
  activity: '활동',
  outcome: '변화·목적',
  factor: '변화 요인',
};

export function nameOf(doc: MapDocument, id: Id): string {
  return entityName(doc, id) ?? '(삭제됨)';
}

export function typeLabelOf(doc: MapDocument, id: Id): string {
  const t = entityTypeOf(doc, id);
  if (!t) return '';
  if (t === 'outcome') return doc.outcomes[id].level === 'purpose' ? '목적' : '변화';
  return entityTypeLabel[t];
}

export function relationTitle(r: Relation): string {
  if (r.kind === 'activityLink' && r.subtype && r.subtype in activityLinkLabel)
    return activityLinkLabel[r.subtype as keyof typeof activityLinkLabel];
  if (r.kind === 'participation' && r.role) return `역할: ${r.role.name}`;
  if (r.kind === 'actorLink' && r.subtype) return r.subtype;
  return relationKindLabel[r.kind];
}

import type { EntityType, Id, MapDocument } from './schema';

const prefix: Record<EntityType | 'relation' | 'review' | 'workspace', string> = {
  actor: 'act',
  activity: 'atv',
  outcome: 'out',
  factor: 'fac',
  relation: 'rel',
  review: 'rev',
  workspace: 'ws',
};

export function newId(type: keyof typeof prefix): Id {
  return `${prefix[type]}_${crypto.randomUUID()}`;
}

/** ID가 어떤 엔티티 컬렉션에 있는지 찾는다. */
export function entityTypeOf(doc: MapDocument, id: Id): EntityType | undefined {
  if (id in doc.actors) return 'actor';
  if (id in doc.activities) return 'activity';
  if (id in doc.outcomes) return 'outcome';
  if (id in doc.factors) return 'factor';
  return undefined;
}

export function entityName(doc: MapDocument, id: Id): string | undefined {
  return (doc.actors[id] ?? doc.activities[id] ?? doc.outcomes[id] ?? doc.factors[id])?.name;
}

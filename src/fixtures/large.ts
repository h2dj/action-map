/**
 * 성능 점검용 대규모 표본: 활동 200·주체 50·변화 40·목적 20·요인 30·관계 약 1,000.
 * 같은 시드로 매번 같은 데이터를 만든다.
 */
import { addActivity, addActor, addFactor, addOutcome, createEmptyDocument } from '../domain/ops';
import type { MapDocument } from '../domain/schema';

/** 결정적인 의사 난수 (같은 데이터로 매번 측정) */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

export function buildLargeDocument(): MapDocument {
  const r = rng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const doc = createEmptyDocument('대규모');
  const acts: string[] = [];
  const statuses = ['idea', 'planned', 'active', 'ongoing', 'done'] as const;
  for (let i = 0; i < 200; i++) {
    const parentId = i > 20 && r() < 0.4 ? pick(acts.slice(0, 20)) : undefined;
    const y = 2018 + Math.floor(r() * 9);
    acts.push(
      addActivity(doc, {
        id: `A${i}`,
        name: `활동 ${i}`,
        status: pick([...statuses]),
        ...(parentId ? { parentId } : {}),
        ...(r() < 0.7 ? { actual: { start: { y, m: 1 + Math.floor(r() * 12) }, ...(r() < 0.5 ? { end: { y: y + 1 } } : {}) } } : {}),
      }),
    );
  }
  const actors = Array.from({ length: 50 }, (_, i) => addActor(doc, { id: `P${i}`, name: `주체 ${i}`, kind: i % 3 ? 'person' : 'org' }));
  const changes = Array.from({ length: 40 }, (_, i) => addOutcome(doc, { id: `C${i}`, name: `변화 ${i}`, level: 'change' }));
  const purposes = Array.from({ length: 20 }, (_, i) => addOutcome(doc, { id: `G${i}`, name: `목적 ${i}`, level: 'purpose' }));
  const factors = Array.from({ length: 30 }, (_, i) => addFactor(doc, { id: `F${i}`, name: `요인 ${i}` }));

  let n = 0;
  const rel = (kind: string, from: string, to: string, extra: object = {}) => {
    const id = `R${n++}`;
    doc.relations[id] = { id, kind, from, to, status: r() < 0.2 ? 'planned' : 'active', evidence: 'hypothesis', ...extra } as never;
  };
  for (let i = 0; i < 350; i++) rel('participation', pick(actors), pick(acts), { role: { name: pick(['기획', '운영', '교육', '모집']) } });
  for (let i = 0; i < 250; i++) {
    const a = pick(acts);
    const b = pick(acts);
    if (a !== b) rel('activityLink', a, b, { subtype: pick(['experience', 'support', 'derive', 'utilize']) });
  }
  for (let i = 0; i < 200; i++) rel('contribution', pick(acts), pick(changes));
  for (let i = 0; i < 80; i++) rel('contribution', pick(changes), pick(purposes));
  for (let i = 0; i < 80; i++) {
    const a = pick(factors);
    const b = pick(factors);
    if (a !== b) rel('influence', a, b, { influence: { sign: pick(['+', '-', '?']) } });
  }
  for (let i = 0; i < 40; i++) rel('factorLink', pick(acts), pick(factors));
  return doc;
}


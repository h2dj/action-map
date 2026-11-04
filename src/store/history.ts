import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import type { MapDocument } from '../domain/schema';

enablePatches();

export type HistoryEntry = { label: string; patches: Patch[]; inverse: Patch[] };

export type History = {
  doc: MapDocument;
  past: HistoryEntry[];
  future: HistoryEntry[];
};

export const HISTORY_LIMIT = 200;

/**
 * recipe를 문서에 적용하고 실행 취소 기록을 남긴다.
 * recipe가 예외를 던지면 문서는 바뀌지 않는다.
 */
export function apply<R>(
  h: History,
  label: string,
  recipe: (draft: MapDocument) => R,
  now = () => new Date().toISOString(),
): { history: History; result: R } {
  let result!: R;
  const [doc, patches, inverse] = produceWithPatches(h.doc, (draft) => {
    result = recipe(draft);
    draft.workspace.updatedAt = now();
  });
  // updatedAt만 바뀐 경우(실질 변경 없음)는 기록하지 않는다
  if (patches.every((p) => p.path.join('.') === 'workspace.updatedAt')) return { history: h, result };
  const past = [...h.past, { label, patches, inverse }].slice(-HISTORY_LIMIT);
  return { history: { doc, past, future: [] }, result };
}

export function undo(h: History): History {
  const entry = h.past.at(-1);
  if (!entry) return h;
  return { doc: applyPatches(h.doc, entry.inverse), past: h.past.slice(0, -1), future: [entry, ...h.future] };
}

export function redo(h: History): History {
  const [entry, ...rest] = h.future;
  if (!entry) return h;
  return { doc: applyPatches(h.doc, entry.patches), past: [...h.past, entry], future: rest };
}

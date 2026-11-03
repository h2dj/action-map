import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { createEmptyDocument } from '../domain/ops';
import type { MapDocument } from '../domain/schema';
import { apply, redo, undo, type History } from './history';

export type MapState = History & {
  /** 문서를 바꾸는 유일한 경로. 실행 취소 기록이 남는다. */
  run: <R>(label: string, recipe: (draft: MapDocument) => R) => R;
  undo: () => void;
  redo: () => void;
  /** 저장소에서 불러오기·가져오기 등 기록을 초기화하며 교체 */
  load: (doc: MapDocument) => void;
};

export function createMapStore(initial: MapDocument = createEmptyDocument('내 활동 지도')) {
  return createStore<MapState>()((set, get) => ({
    doc: initial,
    past: [],
    future: [],
    run(label, recipe) {
      const { history, result } = apply(get(), label, recipe);
      set(history);
      return result;
    },
    undo: () => set(undo(get())),
    redo: () => set(redo(get())),
    load: (doc) => set({ doc, past: [], future: [] }),
  }));
}

export type MapStore = ReturnType<typeof createMapStore>;

export const mapStore = createMapStore();
export const useMap = <T>(selector: (s: MapState) => T) => useStore(mapStore, selector);

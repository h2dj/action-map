/**
 * 자동 저장 (F07). 문서가 바뀌면 잠시 기다렸다가 저장한다.
 * 실패하면 상태를 'error'로 바꾸고 메시지를 남겨 화면에서 알릴 수 있게 하며,
 * 다음 변경이나 retry() 때 다시 시도한다.
 */
import { createStore } from 'zustand/vanilla';
import type { MapDocument } from '../domain/schema';
import type { MapStore } from '../store/mapStore';
import type { Repository } from './repository';

export type SaveStatus =
  | { state: 'idle' }
  | { state: 'pending' }
  | { state: 'saving' }
  | { state: 'saved'; at: string }
  | { state: 'error'; message: string };

export function createAutosave(store: MapStore, repo: Repository, opts: { delayMs?: number } = {}) {
  const delay = opts.delayMs ?? 600;
  const status = createStore<SaveStatus>()(() => ({ state: 'idle' }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSaved: MapDocument | undefined = store.getState().doc;
  let inflight: Promise<void> = Promise.resolve();

  const saveNow = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const doc = store.getState().doc;
    if (doc === lastSaved) return inflight;
    inflight = inflight.then(async () => {
      status.setState({ state: 'saving' }, true);
      try {
        await repo.save(doc);
        await repo.setLastOpened(doc.workspace.id);
        lastSaved = doc;
        status.setState({ state: 'saved', at: new Date().toISOString() }, true);
      } catch (e) {
        status.setState({ state: 'error', message: `저장하지 못했습니다: ${(e as Error).message}` }, true);
      }
    });
    return inflight;
  };

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.doc === prev.doc) return;
    status.setState({ state: 'pending' }, true);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void saveNow(), delay);
  });

  return {
    status,
    /** 남은 변경을 즉시 저장 (창 닫기 전, 작업공간 전환 전) */
    flush: saveNow,
    retry: () => {
      lastSaved = undefined;
      return saveNow();
    },
    /** 불러온 문서를 저장된 상태로 표시 (불러오자마자 다시 저장하지 않도록) */
    markSaved(doc: MapDocument) {
      lastSaved = doc;
      status.setState({ state: 'idle' }, true);
    },
    stop() {
      if (timer) clearTimeout(timer);
      unsubscribe();
    },
  };
}

export type Autosave = ReturnType<typeof createAutosave>;

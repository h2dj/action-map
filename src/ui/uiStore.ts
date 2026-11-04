import { create } from 'zustand';
import { DomainError } from '../domain/ops';
import type { Id, MapDocument } from '../domain/schema';
import type { Issue } from '../domain/validate';
import { mapStore } from '../store/mapStore';

export type Selection = { kind: 'entity'; id: Id } | { kind: 'relation'; id: Id } | { kind: 'loop'; id: Id } | null;

export type Notice = { level: 'info' | 'error'; text: string; issues?: Issue[] };

export type Dialog =
  | { type: 'delete'; id: Id }
  | { type: 'relation'; anchorId?: Id }
  | { type: 'loop'; startId?: Id }
  | null;

export type MapViewId = 'time' | 'collab' | 'purpose' | 'loop';

const savedView = (): MapViewId => {
  try {
    const v = localStorage.getItem('action-map:view');
    return v === 'collab' || v === 'purpose' || v === 'loop' ? v : 'time';
  } catch {
    return 'time';
  }
};

type UiState = {
  /** 현재 지도 보기 (보는 사람마다 다름: 브라우저에만 기억) */
  view: MapViewId;
  timeMode: 'layer' | 'date';
  /** 협력 보기: 선택한 주체·활동 중심으로 펼치기 */
  collabFocus: boolean;
  collabContribution: '' | 'time' | 'money' | 'space' | 'knowledge' | 'network';
  /** 순환 보기: 요인과 연결된 활동도 보기 */
  loopShowLinked: boolean;
  setView: (v: MapViewId) => void;
  setOptions: (o: Partial<Pick<UiState, 'timeMode' | 'collabFocus' | 'collabContribution' | 'loopShowLinked'>>) => void;
  selection: Selection;
  /** 방금 만든 대상: 상세 패널에서 이름 입력란에 바로 초점을 준다 */
  justCreated?: Id;
  notice: Notice | null;
  dialog: Dialog;
  select: (s: Selection, opts?: { justCreated?: boolean }) => void;
  notify: (n: Notice | null) => void;
  open: (d: Dialog) => void;
};

export const useUi = create<UiState>()((set) => ({
  view: savedView(),
  timeMode: 'layer',
  collabFocus: false,
  collabContribution: '',
  loopShowLinked: false,
  setView: (view) => {
    try {
      localStorage.setItem('action-map:view', view);
    } catch {
      /* 저장 못 해도 동작에는 지장 없음 */
    }
    set({ view });
  },
  setOptions: (o) => set(o),
  selection: null,
  notice: null,
  dialog: null,
  select: (selection, opts) => set({ selection, justCreated: opts?.justCreated && selection ? selection.id : undefined }),
  notify: (notice) => set({ notice }),
  open: (dialog) => set({ dialog }),
}));

/**
 * 문서 변경을 실행하고, 규칙 위반이면 화면에 알린다.
 * 성공하면 연산 결과를, 실패하면 undefined를 돌려준다.
 */
export function tryRun<R>(label: string, recipe: (d: MapDocument) => R): R | undefined {
  try {
    return mapStore.getState().run(label, recipe);
  } catch (e) {
    if (e instanceof DomainError) useUi.getState().notify({ level: 'error', text: e.message, issues: e.issues });
    else useUi.getState().notify({ level: 'error', text: `입력값을 확인해 주세요: ${(e as Error).message}` });
    return undefined;
  }
}

/** 실행 취소 등으로 선택 대상이 사라졌으면 선택을 푼다 */
mapStore.subscribe((s) => {
  const sel = useUi.getState().selection;
  if (!sel) return;
  const d = s.doc;
  const exists =
    sel.kind === 'relation'
      ? !!d.relations[sel.id]
      : sel.kind === 'loop'
        ? !!d.loops[sel.id]
        : !!(d.actors[sel.id] || d.activities[sel.id] || d.outcomes[sel.id] || d.factors[sel.id]);
  if (!exists) useUi.getState().select(null);
});

import { useEffect } from 'react';
import { mapStore } from './store/mapStore';
import { DeleteDialog } from './ui/DeleteDialog';
import { EntityDetail } from './ui/EntityDetail';
import { EntityList } from './ui/EntityList';
import { Overview } from './ui/Overview';
import { RelationDialog } from './ui/RelationDialog';
import { RelationEditor } from './ui/RelationEditor';
import { TopBar } from './ui/TopBar';
import { useUi } from './ui/uiStore';

function isTyping(t: EventTarget | null) {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector('dialog[open]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) mapStore.getState().redo();
        else mapStore.getState().undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        mapStore.getState().redo();
      } else if (e.key === 'Delete') {
        const sel = useUi.getState().selection;
        if (sel?.kind === 'entity') useUi.getState().open({ type: 'delete', id: sel.id });
      } else if (e.key === 'Escape') {
        useUi.getState().select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function NoticeBar() {
  const notice = useUi((s) => s.notice);
  const notify = useUi((s) => s.notify);
  if (!notice) return null;
  return (
    <div className={`notice ${notice.level}`} role={notice.level === 'error' ? 'alert' : 'status'}>
      <div>
        <p>{notice.text}</p>
        {notice.issues && notice.issues.length > 0 && (
          <ul>
            {notice.issues.map((i, n) => (
              <li key={n}>
                [{i.level === 'error' ? '오류' : '안내'}] {i.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button aria-label="알림 닫기" onClick={() => notify(null)}>
        ×
      </button>
    </div>
  );
}

export function App({ startupWarning }: { startupWarning?: string }) {
  const selection = useUi((s) => s.selection);
  const dialog = useUi((s) => s.dialog);
  useShortcuts();
  useEffect(() => {
    if (startupWarning) useUi.getState().notify({ level: 'error', text: startupWarning });
  }, [startupWarning]);

  return (
    <div className="app">
      <TopBar />
      <NoticeBar />
      <div className="layout">
        <EntityList />
        <main className="canvas">
          <Overview />
        </main>
        <aside className="panel" aria-label="상세 편집">
          {selection?.kind === 'entity' && <EntityDetail key={selection.id} id={selection.id} />}
          {selection?.kind === 'relation' && <RelationEditor key={selection.id} id={selection.id} />}
          {!selection && <p className="empty">목록이나 카드에서 대상을 고르면 여기에서 편집합니다.</p>}
        </aside>
      </div>
      {dialog?.type === 'delete' && <DeleteDialog id={dialog.id} />}
      {dialog?.type === 'relation' && <RelationDialog anchorId={dialog.anchorId} />}
    </div>
  );
}

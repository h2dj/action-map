import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { addActivity } from './domain/ops';
import { timeLayerOf } from './domain/time';
import type { Issue } from './domain/validate';
import { activityStatusLabel } from './domain/vocab';
import { buildSampleDocument } from './fixtures/sample';
import { exportDocument, exportFileName } from './io/transfer';
import type { WorkspaceSummary } from './persistence/repository';
import { autosave, downloadText, repository, session } from './runtime';
import { mapStore, useMap } from './store/mapStore';

const layers = [
  ['past', '해온 일'],
  ['present', '진행 중인 일'],
  ['future', '하려는 일'],
] as const;

function SaveIndicator() {
  const s = useStore(autosave.status);
  const text =
    s.state === 'saved' ? '저장됨' : s.state === 'saving' ? '저장 중…' : s.state === 'pending' ? '변경됨' : s.state === 'error' ? s.message : '';
  return (
    <span role="status" aria-live="polite" style={{ color: s.state === 'error' ? '#b3261e' : '#555' }}>
      {text}
      {s.state === 'error' && (
        <button style={{ marginLeft: 8 }} onClick={() => void autosave.retry()}>
          다시 저장
        </button>
      )}
    </span>
  );
}

/** M2 임시 화면: 저장·복구 확인용. 지도 화면은 M3~M4에서 구현한다. */
export function App({ startupWarning }: { startupWarning?: string }) {
  const doc = useMap((s) => s.doc);
  const canUndo = useMap((s) => s.past.length > 0);
  const canRedo = useMap((s) => s.future.length > 0);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [message, setMessage] = useState(startupWarning ?? '');
  const [includePrivate, setIncludePrivate] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => void repository.list().then(setWorkspaces);
  useEffect(refresh, [doc.workspace.id]);
  const saveStatus = useStore(autosave.status);
  useEffect(() => {
    if (saveStatus.state === 'saved') refresh();
  }, [saveStatus]);

  const activities = Object.values(doc.activities);

  async function onImport(file: File) {
    const r = await session.importText(await file.text());
    setIssues(r.issues);
    setMessage(r.ok ? `“${file.name}”을(를) 새 작업공간으로 불러왔습니다.` : '불러오지 못했습니다. 아래 문제를 확인하세요.');
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 960, margin: '0 auto' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <h1 style={{ margin: 0, marginRight: 'auto' }}>활동 지도</h1>
        <label>
          작업공간{' '}
          <select value={doc.workspace.id} onChange={(e) => void session.switchTo(e.target.value)}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => void session.createNew(`새 작업공간 ${workspaces.length + 1}`)}>새 작업공간</button>
        <SaveIndicator />
      </header>

      {message && <p role="alert">{message}</p>}
      {issues.length > 0 && (
        <ul aria-label="가져오기 검사 결과">
          {issues.map((i, n) => (
            <li key={n} style={{ color: i.level === 'error' ? '#b3261e' : '#8a5a00' }}>
              [{i.level === 'error' ? '오류' : '경고'}] {i.message}
            </li>
          ))}
        </ul>
      )}

      <p>
        {doc.workspace.name} · 활동 {activities.length} · 주체 {Object.keys(doc.actors).length} · 관계{' '}
        {Object.keys(doc.relations).length}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button onClick={() => mapStore.getState().run('활동 추가', (d) => addActivity(d, { name: `새 활동 ${activities.length + 1}` }))}>
          + 활동 추가
        </button>
        <button disabled={!canUndo} onClick={() => mapStore.getState().undo()}>
          실행 취소
        </button>
        <button disabled={!canRedo} onClick={() => mapStore.getState().redo()}>
          다시 실행
        </button>
        <button onClick={() => void session.openCopy(buildSampleDocument())}>예시 불러오기</button>
        <button onClick={() => downloadText(exportFileName(doc), exportDocument(doc, { includePrivateNotes: includePrivate }))}>
          내보내기(JSON)
        </button>
        <label>
          <input type="checkbox" checked={includePrivate} onChange={(e) => setIncludePrivate(e.target.checked)} /> 비공개 메모 포함
        </label>
        <button onClick={() => fileInput.current?.click()}>가져오기</button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = '';
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {layers.map(([layer, label]) => (
          <section key={layer}>
            <h2>{label}</h2>
            <ul>
              {activities
                .filter((a) => timeLayerOf(a) === layer)
                .map((a) => (
                  <li key={a.id}>
                    {a.parentId ? '└ ' : ''}
                    {a.name} <small>({activityStatusLabel[a.status]})</small>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}

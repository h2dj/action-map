import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { addActivity, addActor, addFactor, addOutcome } from '../domain/ops';
import type { Id, MapDocument } from '../domain/schema';
import { buildSampleDocument } from '../fixtures/sample';
import { applySysmapImport, parseSysmap, planSysmapImport, toSysmap } from '../io/sysmap';
import { exportDocument, exportFileName } from '../io/transfer';
import type { WorkspaceSummary } from '../persistence/repository';
import { autosave, downloadText, repository, session } from '../runtime';
import { mapStore, useMap } from '../store/mapStore';
import { tryRun, useUi } from './uiStore';

function SaveIndicator() {
  const s = useStore(autosave.status);
  if (s.state === 'error')
    return (
      <span role="alert" className="save error">
        {s.message} <button onClick={() => void autosave.retry()}>다시 저장</button>
      </span>
    );
  const text = { idle: '', pending: '변경됨', saving: '저장 중…', saved: '저장됨' }[s.state];
  return (
    <span role="status" aria-live="polite" className="save">
      {text}
    </span>
  );
}

function useWorkspaces(doc: MapDocument) {
  const [list, setList] = useState<WorkspaceSummary[]>([]);
  const status = useStore(autosave.status);
  useEffect(() => {
    void repository.list().then(setList);
  }, [doc.workspace.id, doc.workspace.name, status.state === 'saved']);
  return list;
}

export function TopBar() {
  const doc = useMap((s) => s.doc);
  const canUndo = useMap((s) => s.past.length > 0);
  const canRedo = useMap((s) => s.future.length > 0);
  const workspaces = useWorkspaces(doc);
  const { select, notify, open } = useUi.getState();
  const [includePrivate, setIncludePrivate] = useState(false);
  const jsonInput = useRef<HTMLInputElement>(null);
  const sysmapInput = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const closeMenu = () => menu.current?.removeAttribute('open');

  const create = (label: string, fn: (d: MapDocument) => Id) => {
    const id = tryRun(label, fn);
    if (id) select({ kind: 'entity', id }, { justCreated: true });
  };

  const importJson = async (file: File) => {
    const r = await session.importText(await file.text());
    select(null);
    notify(
      r.ok
        ? { level: 'info', text: `“${file.name}”을(를) 새 작업공간으로 불러왔습니다.`, issues: r.issues }
        : { level: 'error', text: '불러오지 못했습니다. 아래 문제를 확인하세요.', issues: r.issues },
    );
  };

  const importSysmap = async (file: File) => {
    const parsed = parseSysmap(await file.text());
    if (!parsed.ok) return notify({ level: 'error', text: 'SysMap 지도를 읽지 못했습니다.', issues: parsed.issues });
    const plan = planSysmapImport(mapStore.getState().doc, parsed.state);
    const ok = tryRun('SysMap 가져오기', (d) => {
      applySysmapImport(d, plan);
      return true;
    });
    if (ok)
      notify({
        level: 'info',
        text: `SysMap에서 변화 요인 ${plan.newFactors.length}개, 관계 ${plan.newRelations.length}개를 더했습니다. 근거 상태는 ‘기대·가설’입니다.`,
        issues: plan.issues,
      });
  };

  const filePicker = (ref: React.RefObject<HTMLInputElement | null>, onFile: (f: File) => void) => (
    <input
      ref={ref}
      type="file"
      accept=".json,application/json"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = '';
      }}
    />
  );

  return (
    <header className="topbar">
      <h1>활동 지도</h1>
      <label className="workspace">
        <span className="visually-hidden">작업공간</span>
        <select value={doc.workspace.id} onChange={(e) => void session.switchTo(e.target.value).then(() => select(null))}>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
          {!workspaces.some((w) => w.id === doc.workspace.id) && <option value={doc.workspace.id}>{doc.workspace.name}</option>}
        </select>
      </label>
      <SaveIndicator />

      <div className="toolbar" role="toolbar" aria-label="편집">
        <button className="primary" onClick={() => create('활동 추가', (d) => addActivity(d, { name: '새 활동' }))}>
          + 활동
        </button>
        <button onClick={() => create('주체 추가', (d) => addActor(d, { name: '새 주체' }))}>+ 주체</button>
        <button onClick={() => create('변화 추가', (d) => addOutcome(d, { name: '새 변화', level: 'change' }))}>+ 변화·목적</button>
        <button onClick={() => create('요인 추가', (d) => addFactor(d, { name: '새 변화 요인' }))}>+ 요인</button>
        <button
          onClick={() => {
            const sel = useUi.getState().selection;
            open({ type: 'relation', anchorId: sel?.kind === 'entity' ? sel.id : undefined });
          }}
        >
          관계 추가
        </button>
        <button disabled={!canUndo} onClick={() => mapStore.getState().undo()} title="Ctrl+Z">
          실행 취소
        </button>
        <button disabled={!canRedo} onClick={() => mapStore.getState().redo()} title="Ctrl+Shift+Z">
          다시 실행
        </button>

        <details className="menu" ref={menu}>
          <summary>파일</summary>
          <div className="menu-body">
            <button
              onClick={() => {
                closeMenu();
                const name = prompt('새 작업공간 이름', `새 작업공간 ${workspaces.length + 1}`);
                if (name?.trim()) void session.createNew(name.trim()).then(() => select(null));
              }}
            >
              새 작업공간
            </button>
            <button
              onClick={() => {
                closeMenu();
                const name = prompt('작업공간 이름', doc.workspace.name);
                if (name?.trim())
                  tryRun('작업공간 이름 변경', (d) => {
                    d.workspace.name = name.trim();
                  });
              }}
            >
              작업공간 이름 바꾸기
            </button>
            <button
              onClick={() => {
                closeMenu();
                void session.openCopy(buildSampleDocument()).then(() => select(null));
              }}
            >
              예시 불러오기
            </button>
            <hr />
            <button
              onClick={() => {
                closeMenu();
                downloadText(exportFileName(doc), exportDocument(doc, { includePrivateNotes: includePrivate }));
              }}
            >
              내보내기 (JSON)
            </button>
            <label className="check">
              <input type="checkbox" checked={includePrivate} onChange={(e) => setIncludePrivate(e.target.checked)} /> 비공개 메모 포함
            </label>
            <button onClick={() => (closeMenu(), jsonInput.current?.click())}>가져오기 (JSON)</button>
            <hr />
            <button
              onClick={() => {
                closeMenu();
                downloadText(exportFileName(doc).replace('.action-map.json', '.sysmap.json'), JSON.stringify(toSysmap(doc), null, 2));
              }}
            >
              변화 요인을 SysMap으로 내보내기
            </button>
            <button onClick={() => (closeMenu(), sysmapInput.current?.click())}>SysMap 지도 가져오기</button>
          </div>
        </details>
        {filePicker(jsonInput, (f) => void importJson(f))}
        {filePicker(sysmapInput, (f) => void importSysmap(f))}
      </div>
    </header>
  );
}

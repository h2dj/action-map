/** 삭제 전 영향 안내와 하위 활동 처리 선택 (F09) */
import { useState } from 'react';
import { deleteEntity, deleteImpact, type ChildMode } from '../domain/ops';
import type { Id } from '../domain/schema';
import { useMap } from '../store/mapStore';
import { Modal } from './Modal';
import { nameOf, relationTitle } from './labels';
import { tryRun, useUi } from './uiStore';

export function DeleteDialog({ id }: { id: Id }) {
  const doc = useMap((s) => s.doc);
  const close = () => useUi.getState().open(null);
  const [mode, setMode] = useState<ChildMode>('detach');
  if (!(id in doc.actors || id in doc.activities || id in doc.outcomes || id in doc.factors)) return null;
  const impact = deleteImpact(doc, id);
  const hasChildren = impact.descendants.length > 0;
  const relCount = impact.relations.length + (hasChildren && mode === 'cascade' ? impact.descendantRelations.length : 0);

  const confirm = () => {
    const name = nameOf(doc, id);
    const ok = tryRun(`“${name}” 삭제`, (d) => deleteEntity(d, id, hasChildren ? mode : undefined));
    if (ok) {
      close();
      useUi.getState().select(null);
      useUi.getState().notify({ level: 'info', text: `“${name}”을(를) 삭제했습니다. 실행 취소(Ctrl+Z)로 되돌릴 수 있습니다.` });
    }
  };

  return (
    <Modal title="삭제 확인" onClose={close}>
      <p>
        <strong>{nameOf(doc, id)}</strong>을(를) 삭제합니다.
      </p>
      {hasChildren && (
        <fieldset className="field">
          <legend>하위 활동 {impact.descendants.length}개</legend>
          <label className="radio">
            <input type="radio" name="mode" checked={mode === 'detach'} onChange={() => setMode('detach')} />
            <span>하위 활동은 남기고 상위 연결만 해제</span>
          </label>
          <label className="radio">
            <input type="radio" name="mode" checked={mode === 'cascade'} onChange={() => setMode('cascade')} />
            <span>하위 활동과 그 관계도 함께 삭제: {impact.descendants.map((d) => nameOf(doc, d)).join(', ')}</span>
          </label>
        </fieldset>
      )}
      <p>함께 사라지는 관계: {relCount}개</p>
      {impact.relations.length > 0 && (
        <ul className="impact-list">
          {impact.relations.map((rid) => {
            const r = doc.relations[rid];
            const other = r.from === id ? r.to : r.from;
            return (
              <li key={rid}>
                {relationTitle(r)} — {nameOf(doc, other)}
              </li>
            );
          })}
        </ul>
      )}
      {impact.reviews.length > 0 && <p>검토 기록 {impact.reviews.length}개에서 이 대상의 참조가 빠집니다(기록은 남습니다).</p>}
      <p className="hint">삭제 후에도 실행 취소로 되돌릴 수 있습니다.</p>
      <div className="actions">
        <button onClick={close}>취소</button>
        <button className="danger" onClick={confirm}>
          삭제
        </button>
      </div>
    </Modal>
  );
}

/**
 * 표 가져오기 (3단계): CSV·TSV 파일, 노션 데이터베이스 CSV 내보내기, 스프레드시트 붙여넣기.
 * 열의 뜻을 짐작해 보여주고, 사용자가 고친 뒤 미리 보고 가져온다. 한 번의 실행 취소로 되돌릴 수 있다.
 */
import { useMemo, useState } from 'react';
import { activityStatusLabel } from '../domain/vocab';
import { applyTableImport, fieldLabel, guessMapping, parseDelimited, planTableImport, type Field, type ImportPlanRow } from '../io/table';
import { formatPartialDate } from '../domain/time';
import { Modal } from './Modal';
import { tryRun, useUi } from './uiStore';

const targetLabel: Record<ImportPlanRow['target'], string> = {
  activity: '활동',
  actor: '주체',
  change: '변화',
  purpose: '목적',
  factor: '변화 요인',
  outcome: '변화',
};

export function TableImportDialog() {
  const close = () => useUi.getState().open(null);
  const [text, setText] = useState('');
  const [mappingOverride, setMappingOverride] = useState<Field[] | null>(null);
  const [defaultType, setDefaultType] = useState<ImportPlanRow['target']>('activity');

  const rows = useMemo(() => (text.trim() ? parseDelimited(text) : []), [text]);
  const header = rows[0] ?? [];
  const mapping = mappingOverride && mappingOverride.length === header.length ? mappingOverride : guessMapping(header);
  const plan = useMemo(() => (rows.length > 1 ? planTableImport(rows, mapping, defaultType) : undefined), [rows, mapping, defaultType]);

  const doImport = () => {
    if (!plan || !plan.rows.length) return;
    const result = tryRun(`표 가져오기 (${plan.rows.length}행)`, (d) => applyTableImport(d, plan));
    if (!result) return;
    close();
    const ui = useUi.getState();
    ui.notify({
      level: 'info',
      text: `표에서 ${result.created.length}개 기록을 새로 만들었습니다. 실행 취소 한 번으로 모두 되돌릴 수 있습니다.`,
      issues: [...plan.issues, ...result.issues],
    });
    if (result.created[0]) ui.select({ kind: 'entity', id: result.created[0] });
  };

  return (
    <Modal title="표 가져오기 (CSV·노션·스프레드시트)" onClose={close}>
      <p className="hint">
        첫 줄은 머리글이어야 합니다. 노션 데이터베이스는 ••• → 내보내기 → Markdown & CSV로 받은 CSV를 쓰세요. 원본은 바뀌지 않고, 이름이 같은
        기존 기록과 합치지 않고 새 기록으로 만듭니다.
      </p>
      <div className="row">
        <label className="field">
          <span className="label">파일</span>
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                setMappingOverride(null);
                setText(await f.text());
              }
            }}
          />
        </label>
        <label className="field">
          <span className="label">종류 열이 없을 때</span>
          <select value={defaultType} onChange={(e) => setDefaultType(e.target.value as ImportPlanRow['target'])}>
            <option value="activity">활동</option>
            <option value="actor">주체</option>
            <option value="change">변화</option>
            <option value="purpose">목적</option>
            <option value="factor">변화 요인</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span className="label">또는 붙여넣기</span>
        <textarea
          rows={4}
          value={text}
          placeholder={'이름,상태,기간,상위\nIT학교,진행,2024-03 →,\n박람회 참여,완료,2024-05 → 2024-06,IT학교'}
          onChange={(e) => {
            setMappingOverride(null);
            setText(e.target.value);
          }}
        />
      </label>

      {header.length > 0 && (
        <fieldset className="field">
          <legend>열의 뜻 ({rows.length - 1}행)</legend>
          <div className="mapping">
            {header.map((h, i) => (
              <label key={i}>
                <span>{h || `(${i + 1}열)`}</span>
                <select
                  value={mapping[i]}
                  onChange={(e) => {
                    const next = [...mapping];
                    next[i] = e.target.value as Field;
                    setMappingOverride(next);
                  }}
                >
                  {(Object.keys(fieldLabel) as Field[]).map((f) => (
                    <option key={f} value={f}>
                      {fieldLabel[f]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {plan && (
        <>
          <table className="preview">
            <caption>미리 보기 (앞 8행)</caption>
            <thead>
              <tr>
                <th>행</th>
                <th>이름</th>
                <th>종류</th>
                <th>상태</th>
                <th>기간</th>
                <th>상위</th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.slice(0, 8).map((r) => (
                <tr key={r.line}>
                  <td>{r.line}</td>
                  <td>{r.name}</td>
                  <td>{targetLabel[r.target]}</td>
                  <td>{r.status ? activityStatusLabel[r.status] : r.target === 'activity' ? '구상' : ''}</td>
                  <td>{r.dates ? `${formatPartialDate(r.dates.start)} ~ ${r.dates.end ? formatPartialDate(r.dates.end) : ''}` : ''}</td>
                  <td>{r.parentName ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {plan.issues.length > 0 && (
            <ul className="impact-list" aria-label="가져오기 안내">
              {plan.issues.map((i, n) => (
                <li key={n} className={i.level === 'error' ? 'warning' : ''}>
                  {i.message}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="actions">
        <button onClick={close}>취소</button>
        <button className="primary" disabled={!plan?.rows.length} onClick={doImport}>
          {plan?.rows.length ?? 0}개 가져오기
        </button>
      </div>
    </Modal>
  );
}

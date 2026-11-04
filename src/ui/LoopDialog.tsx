/**
 * 순환 구성 (2단계): 시작 요인을 고르고, 영향이 이어지는 요인을 차례로 골라 처음으로 돌아오면 닫힌다.
 * 자동 탐지가 아니라 사용자가 직접 경로를 고른다. 고르는 동안 강화·균형 판정을 미리 보여준다.
 */
import { useState } from 'react';
import { addLoop, analyzeLoop, closesLoop, influenceSentence, loopKindHelp, loopKindLabel, nextFactors } from '../domain/loops';
import type { Id } from '../domain/schema';
import { useMap } from '../store/mapStore';
import { Modal } from './Modal';
import { tryRun, useUi } from './uiStore';

const signText = (s: string) => (s === '-' ? '−' : s);

export function LoopDialog({ startId }: { startId?: Id }) {
  const doc = useMap((s) => s.doc);
  const close = () => useUi.getState().open(null);
  const select = useUi((s) => s.select);
  const [path, setPath] = useState<Id[]>(startId ? [startId] : []);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const factors = Object.values(doc.factors);
  const current = path[path.length - 1];
  const options = current ? nextFactors(doc, current).filter((n) => !path.includes(n.id)) : [];
  const closed = closesLoop(doc, path);
  const analysis = closed ? analyzeLoop(doc, path) : undefined;

  const submit = () => {
    const id = tryRun('순환 구성', (d) => addLoop(d, { factorIds: path, name, description }));
    if (id) {
      close();
      select({ kind: 'loop', id });
    }
  };

  return (
    <Modal title="순환 구성" onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (closed) submit();
        }}
      >
        <p className="hint">
          시작할 변화 요인을 고른 뒤, 영향이 이어지는 요인을 차례로 고르세요. 마지막 요인에서 처음 요인으로 돌아오는 영향이 있으면 순환이
          닫힙니다.
        </p>

        {path.length === 0 ? (
          <fieldset className="field">
            <legend>시작 요인</legend>
            {factors.length === 0 && <p className="empty">변화 요인이 없습니다. 먼저 “+ 요인”으로 추가하세요.</p>}
            <div className="candidates" role="radiogroup">
              {factors.map((f) => (
                <button type="button" key={f.id} className="chip" onClick={() => setPath([f.id])}>
                  {f.name}
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <>
            <ol className="loop-path" aria-label="지금까지 고른 경로">
              {path.map((id, i) => {
                const next = path[i + 1] ?? (closed ? path[0] : undefined);
                const step = analysis?.steps[i] ?? (next ? { sign: nextFactors(doc, id).find((n) => n.id === next)?.sign } : undefined);
                return (
                  <li key={id}>
                    <strong>{doc.factors[id]?.name}</strong>
                    {next && step?.sign && (
                      <span className={`sign sign-${step.sign === '-' ? 'neg' : step.sign === '+' ? 'pos' : 'unk'}`} title={influenceSentence(doc, id, next, step.sign)}>
                        {signText(step.sign)}
                      </span>
                    )}
                  </li>
                );
              })}
              {closed && <li className="back">↩ {doc.factors[path[0]]?.name}</li>}
            </ol>
            <div className="actions start">
              <button type="button" onClick={() => setPath(path.slice(0, -1))}>
                한 단계 되돌리기
              </button>
              <button type="button" onClick={() => setPath([])}>
                처음부터
              </button>
            </div>

            {!closed && (
              <fieldset className="field">
                <legend>다음 요인 (‘{doc.factors[current]?.name}’에서 영향이 가는 요인)</legend>
                {options.length === 0 ? (
                  <p className="empty">
                    이어질 요인이 없습니다. ‘{doc.factors[current]?.name}’에서 나가는 영향 관계를 먼저 추가하거나, 되돌려 다른 경로를 고르세요.
                  </p>
                ) : (
                  <div className="candidates">
                    {options.map((o) => (
                      <button type="button" key={o.id} className="chip" onClick={() => setPath([...path, o.id])} title={influenceSentence(doc, current, o.id, o.sign)}>
                        <span className="sign">{signText(o.sign)}</span> {doc.factors[o.id]?.name}
                      </button>
                    ))}
                  </div>
                )}
                {path.length >= 2 && <p className="hint">‘{doc.factors[current]?.name}’에서 ‘{doc.factors[path[0]]?.name}’(으)로 돌아오는 영향이 아직 없습니다.</p>}
              </fieldset>
            )}

            {analysis && (
              <div className={`loop-verdict kind-${analysis.kind}`} role="status">
                <strong>{loopKindLabel[analysis.kind]}</strong>
                <p>{loopKindHelp[analysis.kind]}</p>
                {analysis.hasDelay && <p>지연이 있는 영향이 있어 효과가 늦게 나타날 수 있습니다.</p>}
                <p className="hint">판정은 기록한 부호에 따른 구조이며, 관계가 실제로 그런지는 근거로 확인해야 합니다.</p>
              </div>
            )}

            {closed && (
              <>
                <label className="field">
                  <span className="label">이름 (비우면 R1·B1처럼 번호를 붙입니다)</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: R1 과부하" />
                </label>
                <label className="field">
                  <span className="label">설명</span>
                  <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="이 순환이 어떤 상황을 설명하나요?" />
                </label>
              </>
            )}
          </>
        )}

        <div className="actions">
          <button type="button" onClick={close}>
            취소
          </button>
          <button type="submit" className="primary" disabled={!closed}>
            순환 저장
          </button>
        </div>
      </form>
    </Modal>
  );
}

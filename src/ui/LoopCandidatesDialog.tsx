/**
 * 순환 후보 찾기 (3단계): 영향 관계에서 닫힌 경로를 찾아 제안하고, 사용자가 골라 저장한다.
 * 후보가 있다는 것은 기록한 영향이 그렇게 이어진다는 뜻일 뿐, 실제로 작동한다는 증거는 아니다.
 */
import { addLoop, findLoopCandidates, loopKindLabel } from '../domain/loops';
import { useMap } from '../store/mapStore';
import { Modal } from './Modal';
import { tryRun, useUi } from './uiStore';

const sign = (s?: string) => (s === '-' ? '−' : (s ?? ''));

export function LoopCandidatesDialog() {
  const doc = useMap((s) => s.doc);
  const close = () => useUi.getState().open(null);
  const { candidates, truncated } = findLoopCandidates(doc, { maxResults: 50 });

  return (
    <Modal title="순환 후보" onClose={close}>
      <p className="hint">
        영향 관계를 따라 처음으로 돌아오는 경로입니다. 저장한 순환은 빼고 보여줍니다. 후보는 기록한 영향이 이렇게 이어진다는 뜻일 뿐, 실제로
        작동한다는 근거는 아닙니다. 의미 있는 것만 골라 저장하세요.
      </p>
      {candidates.length === 0 && <p className="empty">새로 찾은 순환이 없습니다.</p>}
      {truncated && <p className="warning">경로가 많아 앞의 50개까지만 찾았습니다.</p>}
      <ul className="candidate-list">
        {candidates.map((c) => {
          const key = c.factorIds.join('>');
          return (
            <li key={key} className={`loop-verdict kind-${c.analysis.kind}`}>
              <div>
                <strong>{loopKindLabel[c.analysis.kind]}</strong>
                {c.analysis.hasDelay && <small> · 지연 있음</small>}
              </div>
              <p className="candidate-path">
                {c.analysis.steps.map((s, i) => (
                  <span key={i}>
                    {doc.factors[s.from]?.name} <b className={`sign sign-${s.sign === '-' ? 'neg' : s.sign === '+' ? 'pos' : 'unk'}`}>{sign(s.sign)}</b>{' '}
                  </span>
                ))}
                ↩
              </p>
              <button
                onClick={() => {
                  const id = tryRun('순환 후보 저장', (d) => addLoop(d, { factorIds: c.factorIds }));
                  if (id) useUi.getState().notify({ level: 'info', text: `“${doc.factors[c.factorIds[0]]?.name}”에서 시작하는 순환을 저장했습니다.` });
                }}
              >
                이 순환 저장
              </button>
            </li>
          );
        })}
      </ul>
      <div className="actions">
        <button onClick={close}>닫기</button>
      </div>
    </Modal>
  );
}

/** 선택한 순환: 판정·경로·설명·검토 기록 (2단계) */
import { analyzeLoop, deleteLoop, influenceSentence, loopKindHelp, loopKindLabel, updateLoop } from '../domain/loops';
import type { Id } from '../domain/schema';
import { useMap } from '../store/mapStore';
import { TextField } from './fields';
import { ReviewNotes } from './ReviewNotes';
import { tryRun, useUi } from './uiStore';

export function LoopEditor({ id }: { id: Id }) {
  const doc = useMap((s) => s.doc);
  const select = useUi((s) => s.select);
  const notify = useUi((s) => s.notify);
  const loop = doc.loops[id];
  if (!loop) return null;
  const a = analyzeLoop(doc, loop.factorIds);
  const name = (fid: Id) => doc.factors[fid]?.name ?? '(삭제됨)';

  return (
    <div className="detail">
      <header className="detail-head">
        <span className={`badge loop-badge kind-${a.kind}`}>{loopKindLabel[a.kind]}</span>
        <code className="id">{id}</code>
        <button
          className="danger"
          onClick={() => {
            const ok = tryRun(`순환 “${loop.name}” 삭제`, (d) => {
              deleteLoop(d, id);
              return true;
            });
            if (ok) {
              select(null);
              notify({ level: 'info', text: '순환을 삭제했습니다. 요인과 영향 관계는 그대로 남아 있습니다. 실행 취소로 되돌릴 수 있습니다.' });
            }
          }}
        >
          삭제
        </button>
      </header>
      <TextField label="이름" required value={loop.name} onCommit={(v) => tryRun('순환 이름 변경', (d) => updateLoop(d, id, { name: v }))} />

      <div className={`loop-verdict kind-${a.kind}`}>
        <p>{loopKindHelp[a.kind]}</p>
        {(a.kind === 'R' || a.kind === 'B') && (
          <p>
            반대 방향(−) 영향 {a.negatives}개 → {a.negatives % 2 === 0 ? '짝수라서 강화' : '홀수라서 균형'}
          </p>
        )}
        {a.hasDelay && <p>지연(‖)이 있는 영향이 있어 효과가 늦게 나타날 수 있습니다.</p>}
        <p className="hint">판정은 기록한 부호에 따른 구조입니다. 각 영향이 실제로 그런지는 근거 상태로 따로 확인합니다.</p>
      </div>

      <section aria-label="순환 경로">
        <h3>경로</h3>
        <ol className="loop-steps">
          {a.steps.map((s, i) => (
            <li key={i} className={!s.relationId ? 'missing' : s.sign === '?' ? 'unknown' : ''}>
              {s.relationId ? (
                <button className="link" onClick={() => select({ kind: 'relation', id: s.relationId! })}>
                  {influenceSentence(doc, s.from, s.to, s.sign)}
                  {s.delayed && ' ‖ 지연'}
                </button>
              ) : (
                <span>
                  ⚠ ‘{name(s.from)}’ → ‘{name(s.to)}’ 영향 관계가 없습니다
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <TextField
        label="설명"
        multiline
        value={loop.description}
        onCommit={(v) => tryRun('순환 설명 변경', (d) => updateLoop(d, id, { description: v || undefined }))}
      />
      <ReviewNotes targetId={id} />
    </div>
  );
}

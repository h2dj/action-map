/**
 * 검토 기록 (2단계): 대상에 대한 판단과 후속 질문을 날짜와 함께 남긴다.
 * 기획서 사용 흐름 6단계 “판단과 후속 질문을 남긴다”.
 */
import { useState } from 'react';
import { addReview, deleteReview, updateReview } from '../domain/loops';
import type { Id } from '../domain/schema';
import { useMap } from '../store/mapStore';
import { TextField } from './fields';
import { tryRun } from './uiStore';

export function ReviewNotes({ targetId }: { targetId: Id }) {
  const doc = useMap((s) => s.doc);
  const notes = Object.values(doc.reviews)
    .filter((r) => r.targetIds.includes(targetId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const [question, setQuestion] = useState('');
  const [judgment, setJudgment] = useState('');

  const add = () => {
    const ok = tryRun('검토 기록 추가', (d) => addReview(d, { targetIds: [targetId], question, judgment }));
    if (ok) {
      setQuestion('');
      setJudgment('');
    }
  };

  return (
    <section className="reviews" aria-label="검토 기록">
      <h3>검토 기록 {notes.length}</h3>
      {notes.map((n) => (
        <article key={n.id} className="review">
          <header>
            <time dateTime={n.date}>{n.date}</time>
            <button
              className="link"
              aria-label={`${n.date} 검토 기록 삭제`}
              onClick={() =>
                tryRun('검토 기록 삭제', (d) => {
                  deleteReview(d, n.id);
                  return true;
                })
              }
            >
              삭제
            </button>
          </header>
          <TextField label="판단" multiline value={n.judgment} onCommit={(v) => tryRun('판단 수정', (d) => updateReview(d, n.id, { judgment: v }))} />
          <TextField label="후속 질문" multiline value={n.question} onCommit={(v) => tryRun('질문 수정', (d) => updateReview(d, n.id, { question: v }))} />
        </article>
      ))}
      <form
        className="review-new"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="field">
          <span className="label">판단</span>
          <textarea rows={2} value={judgment} onChange={(e) => setJudgment(e.target.value)} placeholder="이어갈 것, 조정할 역할, 새로 만들 연결…" />
        </label>
        <label className="field">
          <span className="label">후속 질문</span>
          <textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="확인할 가설이나 다음에 물어볼 것" />
        </label>
        <button type="submit" disabled={!question.trim() && !judgment.trim()}>
          + 검토 기록 추가
        </button>
      </form>
    </section>
  );
}

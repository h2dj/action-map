/**
 * 성능 점검 (3단계): 계획의 잠정 목표 "활동 200·관계 1,000에서 보기 전환 1초 이내".
 * 보기 배치 계산과 검사는 화면 그리기 전에 끝나야 하므로 각각 넉넉한 상한으로 확인한다.
 */
import { describe, expect, it } from 'vitest';
import { findLoopCandidates } from '../../src/domain/loops';
import { buildLargeDocument } from '../../src/fixtures/large';
import { validateDocument } from '../../src/domain/validate';
import { exportDocument, parseImport } from '../../src/io/transfer';
import { filterProjectionAsOf } from '../../src/views/asOf';
import { projectCollab } from '../../src/views/collabView';
import { projectLoop } from '../../src/views/loopView';
import { projectPurpose } from '../../src/views/purposeView';
import { projectTime } from '../../src/views/timeView';

function time<T>(fn: () => T): { ms: number; result: T } {
  const t0 = performance.now();
  const result = fn();
  return { ms: performance.now() - t0, result };
}

describe('성능: 활동 200·관계 약 1,000', () => {
  const doc = buildLargeDocument();

  it('표본 규모를 확인한다', () => {
    expect(Object.keys(doc.activities)).toHaveLength(200);
    expect(Object.keys(doc.relations).length).toBeGreaterThanOrEqual(950);
  });

  const LIMIT = 250; // ms. 보기 전환 1초 목표 안에서 그리기 시간을 남긴다
  const cases: [string, () => unknown][] = [
    ['시간 보기', () => projectTime(doc, undefined)],
    ['시간 보기(날짜)', () => projectTime(doc, undefined, 'date')],
    ['협력 보기', () => projectCollab(doc, undefined)],
    ['목적 보기', () => projectPurpose(doc, undefined)],
    ['순환 보기', () => projectLoop(doc, undefined, { showLinked: true })],
    ['과거 시점 필터', () => filterProjectionAsOf(doc, projectTime(doc, undefined), { y: 2021 })],
    ['무결성 검사', () => validateDocument(doc)],
    ['순환 후보 찾기', () => findLoopCandidates(doc, { maxResults: 50 })],
    ['내보내기·가져오기 왕복', () => parseImport(exportDocument(doc))],
  ];
  it.each(cases)('%s', (_, fn) => {
    fn(); // 첫 실행(JIT) 제외
    const { ms } = time(fn);
    expect(ms).toBeLessThan(LIMIT);
  });
});

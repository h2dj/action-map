import { describe, expect, it } from 'vitest';
import {
  addLoop,
  addReview,
  analyzeLoop,
  closesLoop,
  deleteLoop,
  deleteReview,
  influenceSentence,
  nextFactors,
  updateLoop,
  updateReview,
} from '../../src/domain/loops';
import { deleteEntity, deleteImpact, DomainError, updateRelation } from '../../src/domain/ops';
import { MapDocument } from '../../src/domain/schema';
import { hasErrors, validateDocument } from '../../src/domain/validate';
import { buildSampleDocument } from '../../src/fixtures/sample';
import { exportDocument, parseImport } from '../../src/io/transfer';
import { migrate } from '../../src/io/migrate';

describe('강화·균형 판정', () => {
  it('음의 영향이 짝수면 R, 홀수면 B', () => {
    const doc = buildSampleDocument();
    expect(analyzeLoop(doc, ['F02', 'F01', 'F05'])).toMatchObject({ kind: 'R', negatives: 2, hasDelay: true });
    expect(analyzeLoop(doc, ['F03', 'F04', 'F06'])).toMatchObject({ kind: 'R', negatives: 0, hasDelay: false });
    expect(analyzeLoop(doc, ['F04', 'F07', 'F02'])).toMatchObject({ kind: 'B', negatives: 1 });
  });

  it('부호가 미정이면 판정하지 않는다', () => {
    const doc = buildSampleDocument();
    updateRelation(doc, 'R17', { influence: { sign: '?' } });
    const a = analyzeLoop(doc, ['F03', 'F04', 'F06']);
    expect(a.kind).toBe('undetermined');
    expect(a.unknown.map((s) => s.relationId)).toEqual(['R17']);
  });

  it('같은 구간의 관계끼리 부호가 다르면 미정으로 본다', () => {
    const doc = buildSampleDocument();
    doc.relations.Z = { id: 'Z', kind: 'influence', from: 'F03', to: 'F04', status: 'active', evidence: 'hypothesis', influence: { sign: '-' } };
    expect(analyzeLoop(doc, ['F03', 'F04', 'F06']).kind).toBe('undetermined');
  });

  it('이어지지 않은 구간이 있으면 끊긴 순환', () => {
    const doc = buildSampleDocument();
    const a = analyzeLoop(doc, ['F03', 'F06', 'F04']); // 방향이 반대
    expect(a.kind).toBe('broken');
    expect(a.missing.length).toBeGreaterThan(0);
  });

  it('영향 관계를 지우면 저장된 순환은 끊긴 순환으로 표시된다', () => {
    const doc = buildSampleDocument();
    delete doc.relations.R18;
    expect(analyzeLoop(doc, doc.loops.L_R2.factorIds).kind).toBe('broken');
    expect(hasErrors(validateDocument(doc))).toBe(false); // 기록 자체는 유효
  });
});

describe('수동 순환 구성', () => {
  it('다음에 고를 수 있는 요인과 닫힘 여부를 알려준다', () => {
    const doc = buildSampleDocument();
    expect(nextFactors(doc, 'F04').map((n) => n.id).sort()).toEqual(['F06', 'F07']);
    expect(closesLoop(doc, ['F03', 'F04'])).toBe(false);
    expect(closesLoop(doc, ['F03', 'F04', 'F06'])).toBe(true);
  });

  it('이름을 비우면 판정에 맞춰 번호를 붙인다', () => {
    const doc = buildSampleDocument();
    delete doc.loops.L_R2;
    const id = addLoop(doc, { factorIds: ['F03', 'F04', 'F06'] });
    expect(doc.loops[id].name).toBe('R1');
    updateLoop(doc, id, { name: '배움 순환', description: '설명' });
    expect(doc.loops[id]).toMatchObject({ name: '배움 순환', description: '설명' });
  });

  it('끊긴 순환·중복 요인·요인이 아닌 대상은 거부한다', () => {
    const doc = buildSampleDocument();
    expect(() => addLoop(doc, { factorIds: ['F03', 'F06', 'F04'] })).toThrow(DomainError);
    expect(() => addLoop(doc, { factorIds: ['F03', 'F03'] })).toThrow(DomainError);
    expect(() => addLoop(doc, { factorIds: ['A02', 'F03'] })).toThrow(DomainError);
    expect(() => addLoop(doc, { factorIds: ['F03'] })).toThrow(DomainError);
    // 시작점만 다른 같은 순환
    expect(() => addLoop(doc, { factorIds: ['F04', 'F06', 'F03'] })).toThrow('같은 경로의 순환');
  });

  it('요인을 지우면 그 요인이 든 순환도 함께 사라지고 영향 안내에 나온다', () => {
    const doc = buildSampleDocument();
    expect(deleteImpact(doc, 'F02').loops.sort()).toEqual(['L_B1', 'L_R1']);
    deleteEntity(doc, 'F02');
    expect(Object.keys(doc.loops)).toEqual(['L_R2']);
    expect(hasErrors(validateDocument(doc))).toBe(false);
  });

  it('순환을 지우면 검토 기록의 참조도 정리된다', () => {
    const doc = buildSampleDocument();
    const rv = addReview(doc, { targetIds: ['L_R1', 'F02'], question: '역할 분담이 실제로 업무를 줄였나?' });
    deleteLoop(doc, 'L_R1');
    expect(doc.reviews[rv].targetIds).toEqual(['F02']);
  });
});

describe('부호의 뜻을 문장으로', () => {
  it('+·−·미정을 늘고 주는 방향으로 풀어 쓴다', () => {
    const doc = buildSampleDocument();
    expect(influenceSentence(doc, 'F02', 'F01', '-')).toBe('‘운영 업무량’이(가) 늘면 ‘나의 시간·주의력·회복 여력’은(는) 줄어든다 (줄면 오히려 는다)');
    expect(influenceSentence(doc, 'F03', 'F04', '+')).toContain('늘어난다');
    expect(influenceSentence(doc, 'F03', 'F04', '?')).toContain('방향은 아직 정하지 않았다');
  });
});

describe('검토 기록', () => {
  it('질문이나 판단 중 하나는 있어야 한다', () => {
    const doc = buildSampleDocument();
    expect(() => addReview(doc, { targetIds: ['A02'] })).toThrow(DomainError);
    const id = addReview(doc, { targetIds: ['A02'], judgment: '모집 역할을 협력 단체와 나눈다', date: '2026-11-04' });
    expect(doc.reviews[id]).toMatchObject({ judgment: '모집 역할을 협력 단체와 나눈다', date: '2026-11-04' });
    updateReview(doc, id, { question: '다음 분기에 모집 인원이 유지되는가?' });
    expect(doc.reviews[id].question).toBeDefined();
    expect(() => updateReview(doc, id, { question: '', judgment: '' })).toThrow(DomainError);
    deleteReview(doc, id);
    expect(doc.reviews[id]).toBeUndefined();
  });
});

describe('스키마 v2 이전', () => {
  it('v1 데이터(순환 없음)를 불러오면 빈 순환 목록이 생긴다', () => {
    const v1 = JSON.parse(exportDocument(buildSampleDocument()));
    v1.document.schemaVersion = 1;
    delete v1.document.loops;
    const r = parseImport(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.schemaVersion).toBe(2);
      expect(r.doc.loops).toEqual({});
    }
  });

  it('v2 문서는 그대로 통과한다', () => {
    const doc = buildSampleDocument();
    expect(MapDocument.parse(migrate(structuredClone(doc)))).toEqual(doc);
  });
});

import { findLoopCandidates } from '../../src/domain/loops';

describe('순환 후보 찾기', () => {
  it('저장되지 않은 닫힌 경로만 후보로 낸다', () => {
    const doc = buildSampleDocument();
    // 예시의 세 순환은 이미 저장되어 있다
    expect(findLoopCandidates(doc).candidates).toEqual([]);
    delete doc.loops.L_B1;
    const { candidates } = findLoopCandidates(doc);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].analysis.kind).toBe('B');
    expect(new Set(candidates[0].factorIds)).toEqual(new Set(['F04', 'F07', 'F02']));
  });

  it('같은 순환을 시작점만 바꿔 중복으로 내지 않고, 개수 한도를 지킨다', () => {
    const doc = buildSampleDocument();
    doc.loops = {};
    const { candidates } = findLoopCandidates(doc);
    expect(candidates).toHaveLength(3);
    // 완전 그래프 6개 요인: 순환이 매우 많으므로 한도에서 멈춘다
    const dense = buildSampleDocument();
    dense.loops = {};
    const fs = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06'];
    let n = 0;
    for (const a of fs)
      for (const b of fs) {
        if (a === b) continue;
        const id = `X${n++}`;
        dense.relations[id] = { id, kind: 'influence', from: a, to: b, status: 'active', evidence: 'hypothesis', influence: { sign: '+' } };
      }
    const r = findLoopCandidates(dense, { maxResults: 20 });
    expect(r.candidates.length).toBeLessThanOrEqual(20);
    expect(r.truncated).toBe(true);
  });

  it('부호가 미정인 경로도 후보로 내되 판정 보류로 표시한다', () => {
    const doc = buildSampleDocument();
    doc.loops = {};
    updateRelation(doc, 'R17', { influence: { sign: '?' } });
    const r2 = findLoopCandidates(doc).candidates.find((c) => c.factorIds.includes('F06'))!;
    expect(r2.analysis.kind).toBe('undetermined');
  });
});

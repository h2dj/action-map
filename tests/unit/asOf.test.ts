import { describe, expect, it } from 'vitest';
import { updateEntity, updateRelation } from '../../src/domain/ops';
import { buildSampleDocument } from '../../src/fixtures/sample';
import { activityAt, filterProjectionAsOf, parseAsOf, rangeCovers } from '../../src/views/asOf';
import { projectCollab } from '../../src/views/collabView';
import { projectTime } from '../../src/views/timeView';

const ids = (p: { nodes: { kind: string; id: string }[] }) => p.nodes.filter((n) => n.kind === 'entity').map((n) => n.id);

describe('기간이 기준 시점을 포함하는지', () => {
  it('연·월 정밀도를 고려한다', () => {
    expect(rangeCovers({ start: { y: 2024, m: 3 }, end: { y: 2024, m: 9 } }, { y: 2024, m: 5 })).toBe(true);
    expect(rangeCovers({ start: { y: 2024, m: 3 }, end: { y: 2024, m: 9 } }, { y: 2024, m: 10 })).toBe(false);
    expect(rangeCovers({ start: { y: 2024 } }, { y: 2030 })).toBe(true); // 종료 미정은 이어지는 것으로
    expect(rangeCovers({ end: { y: 2023 } }, { y: 2023, m: 12 })).toBe(true); // 종료 연도의 12월까지
    expect(rangeCovers({ start: { y: 2025, m: 2 } }, { y: 2025 })).toBe(true); // 연도 단위 기준은 그 해와 겹치면
    expect(rangeCovers(undefined, { y: 2025 })).toBeUndefined();
  });

  it('실제 기간을 우선하고, 없으면 예정 기간을 본다', () => {
    const doc = buildSampleDocument();
    updateEntity(doc, 'A04', { planned: { start: { y: 2027 } } });
    expect(activityAt(doc.activities.A04, { y: 2026 })).toBe('inactive');
    expect(activityAt(doc.activities.A04, { y: 2027, m: 6 })).toBe('active');
    updateEntity(doc, 'A04', { actual: { start: { y: 2026, m: 10 } } });
    expect(activityAt(doc.activities.A04, { y: 2026, m: 11 })).toBe('active');
    expect(activityAt(doc.activities.A03, { y: 2026 })).toBe('undated');
  });

  it('기준 시점 입력을 읽는다', () => {
    expect(parseAsOf('2025-03')).toEqual({ y: 2025, m: 3 });
    expect(parseAsOf('2025')).toEqual({ y: 2025 });
    expect(parseAsOf('2025-13')).toBeUndefined();
    expect(parseAsOf('작년')).toBeUndefined();
  });
});

describe('보기에 기준 시점 적용', () => {
  it('그 시점에 진행하지 않은 활동과 유효 기간 밖의 관계를 숨긴다', () => {
    const doc = buildSampleDocument();
    updateEntity(doc, 'A05', { actual: { start: { y: 2021 }, end: { y: 2022 } } }); // 역량진단·박람회 경험
    updateEntity(doc, 'A02', { actual: { start: { y: 2024, m: 3 } } }); // IT학교
    updateRelation(doc, 'E04', { validity: { start: { y: 2025 } } }); // 공동체IT 운영 역할은 2025부터

    const t2022 = filterProjectionAsOf(doc, projectTime(doc, undefined), { y: 2022 });
    expect(ids(t2022)).toContain('A05');
    expect(ids(t2022)).not.toContain('A02');
    expect(t2022.edges.some((e) => e.source === 'A05' && e.target === 'A02')).toBe(false);
    expect(t2022.notes[0]).toContain('2022년 기준');

    const c2024 = filterProjectionAsOf(doc, projectCollab(doc, undefined), { y: 2024, m: 6 });
    expect(c2024.edges.map((e) => e.relationId)).not.toContain('E04');
    expect(c2024.edges.map((e) => e.relationId)).toContain('E01');
    const c2025 = filterProjectionAsOf(doc, projectCollab(doc, undefined), { y: 2025, m: 6 });
    expect(c2025.edges.map((e) => e.relationId)).toContain('E04');
  });

  it('날짜 없는 활동은 남기되 점선으로 표시한다', () => {
    const doc = buildSampleDocument();
    const p = filterProjectionAsOf(doc, projectTime(doc, undefined), { y: 2025 });
    const a03 = p.nodes.find((n) => n.id === 'A03');
    expect(a03).toMatchObject({ tentative: true });
    expect(p.notes.join(' ')).toContain('날짜가 없는 활동');
  });
});

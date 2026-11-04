import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../../src/domain/ops';
import { hasErrors, validateDocument } from '../../src/domain/validate';
import { buildSampleDocument } from '../../src/fixtures/sample';
import { applyTableImport, guessMapping, parseDelimited, parseLooseDate, parsePeriod, planTableImport } from '../../src/io/table';

describe('표 읽기', () => {
  it('따옴표 안의 쉼표·줄바꿈·이스케이프를 처리한다', () => {
    const rows = parseDelimited('이름,설명\n"IT학교","교육, 체계\n개발"\n"따옴표 ""예""",\n');
    expect(rows).toEqual([
      ['이름', '설명'],
      ['IT학교', '교육, 체계\n개발'],
      ['따옴표 "예"', ''],
    ]);
  });

  it('탭으로 나뉜 붙여넣기(스프레드시트)를 알아본다', () => {
    expect(parseDelimited('이름\t상태\nA\t진행')).toEqual([
      ['이름', '상태'],
      ['A', '진행'],
    ]);
  });

  it('BOM과 빈 줄을 무시한다', () => {
    expect(parseDelimited('﻿Name\n\nA\n')).toEqual([['Name'], ['A']]);
  });

  it('머리글로 열의 뜻을 짐작한다 (노션 영문 내보내기 포함)', () => {
    expect(guessMapping(['Name', 'Status', 'Date', 'Tags', '비고'])).toEqual(['name', 'status', 'period', 'tags', 'description']);
    expect(guessMapping(['활동명', '종류', '시작일', '종료일', '상위 사업'])).toEqual(['name', 'type', 'start', 'end', 'parent']);
  });
});

describe('날짜 읽기', () => {
  it('여러 형식을 아는 정밀도로 읽는다', () => {
    expect(parseLooseDate('2025')).toEqual({ y: 2025 });
    expect(parseLooseDate('2025-03')).toEqual({ y: 2025, m: 3 });
    expect(parseLooseDate('2025.3.1')).toEqual({ y: 2025, m: 3, d: 1 });
    expect(parseLooseDate('2025년 3월 1일')).toEqual({ y: 2025, m: 3, d: 1 });
    expect(parseLooseDate('2025년 11월')).toEqual({ y: 2025, m: 11 });
    expect(parseLooseDate('March 1, 2025')).toEqual({ y: 2025, m: 3, d: 1 });
    expect(parseLooseDate('Nov 2024')).toEqual({ y: 2024, m: 11 });
    expect(parseLooseDate('내년 봄')).toBeUndefined();
  });

  it('노션 기간 표기를 시작·종료로 나눈다', () => {
    expect(parsePeriod('2025년 3월 1일 → 2025년 6월 30일')).toEqual({ start: { y: 2025, m: 3, d: 1 }, end: { y: 2025, m: 6, d: 30 } });
    expect(parsePeriod('March 1, 2025 → June 30, 2025')).toEqual({ start: { y: 2025, m: 3, d: 1 }, end: { y: 2025, m: 6, d: 30 } });
    expect(parsePeriod('2024 ~ 2025')).toEqual({ start: { y: 2024 }, end: { y: 2025 } });
    expect(parsePeriod('2024-05')).toEqual({ start: { y: 2024, m: 5 } });
  });
});

describe('가져오기 계획과 적용', () => {
  const csv = [
    '이름,종류,상태,기간,상위,설명',
    'IT학교,활동,진행,2024-03 → ,,디지털역량 교육',
    '박람회 참여,활동,완료,2024년 5월 → 2024년 6월,IT학교,',
    '역량진단 운영,활동,예정,2025-09,박람회 참여,',
    '공동체IT,단체,,,,협동조합',
    '디지털 배제 감소,목적,,,,',
    ',활동,,,,',
    '정체불명,기타,이상함,언젠가,,',
  ].join('\n');

  it('행마다 종류·상태·날짜·상위를 읽고, 읽지 못한 값은 안내한다', () => {
    const rows = parseDelimited(csv);
    const plan = planTableImport(rows, guessMapping(rows[0]));
    expect(plan.rows.map((r) => [r.name, r.target, r.status])).toEqual([
      ['IT학교', 'activity', 'active'],
      ['박람회 참여', 'activity', 'done'],
      ['역량진단 운영', 'activity', 'planned'],
      ['공동체IT', 'actor', undefined],
      ['디지털 배제 감소', 'purpose', undefined],
      ['정체불명', 'activity', undefined],
    ]);
    expect(plan.rows[3].actorKind).toBe('org');
    expect(plan.issues.map((i) => i.code).sort()).toEqual(['table.badDate', 'table.emptyName', 'table.unknownStatus', 'table.unknownType']);
  });

  it('새 기록으로 만들고, 표 안의 이름으로 상위 활동을 잇고, 날짜는 상태에 맞는 기간에 넣는다', () => {
    const doc = createEmptyDocument('t');
    const rows = parseDelimited(csv);
    const { created, issues } = applyTableImport(doc, planTableImport(rows, guessMapping(rows[0])));
    expect(created).toHaveLength(6);
    expect(issues).toEqual([]);
    const byName = (n: string) => Object.values(doc.activities).find((a) => a.name === n)!;
    expect(byName('박람회 참여').parentId).toBe(byName('IT학교').id);
    expect(byName('역량진단 운영').parentId).toBe(byName('박람회 참여').id);
    expect(byName('박람회 참여').actual).toEqual({ start: { y: 2024, m: 5 }, end: { y: 2024, m: 6 } });
    expect(byName('역량진단 운영').planned).toEqual({ start: { y: 2025, m: 9 } });
    expect(Object.values(doc.actors)[0]).toMatchObject({ name: '공동체IT', kind: 'org', description: '협동조합' });
    expect(hasErrors(validateDocument(doc))).toBe(false);
  });

  it('기존 기록과 이름이 같아도 합치지 않는다. 상위는 기존 활동 중 하나뿐일 때만 잇는다', () => {
    const doc = buildSampleDocument();
    const before = Object.keys(doc.activities).length;
    const rows = parseDelimited('이름,상위\nIT학교,\n새 프로그램,IT학교\n다른 프로그램,없는 사업');
    const { created, issues } = applyTableImport(doc, planTableImport(rows, guessMapping(rows[0])));
    expect(Object.keys(doc.activities).length).toBe(before + 3);
    // 표 안에도 'IT학교'가 있으므로 표의 것에 잇는다
    expect(doc.activities[created[1]].parentId).toBe(created[0]);
    expect(issues.map((i) => i.code)).toEqual(['table.missingParent']);
  });

  it('이름 열이 없으면 거부한다', () => {
    const plan = planTableImport([['a', 'b'], ['1', '2']], ['ignore', 'ignore']);
    expect(plan.issues[0].code).toBe('table.noName');
  });
});

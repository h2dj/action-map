import { describe, expect, it } from 'vitest';
import {
  addActivity,
  addActor,
  addRelation,
  createEmptyDocument,
  deleteEntity,
  deleteImpact,
  DomainError,
  setParent,
  updateEntity,
  updateRelation,
} from '../../src/domain/ops';
import { MapDocument } from '../../src/domain/schema';
import { comparePartialDate, timeLayerOf } from '../../src/domain/time';
import { validateDocument, hasErrors } from '../../src/domain/validate';
import { buildSampleDocument } from '../../src/fixtures/sample';

const fresh = () => createEmptyDocument('테스트', '2026-01-01T00:00:00.000Z');

describe('표본 데이터', () => {
  it('스키마와 무결성 검사를 통과한다', () => {
    const doc = buildSampleDocument();
    expect(MapDocument.safeParse(doc).success).toBe(true);
    expect(validateDocument(doc).filter((i) => i.level === 'error')).toEqual([]);
    expect(Object.keys(doc.activities).length).toBeGreaterThanOrEqual(10);
  });

  it('모든 관계는 근거 상태가 가설이다', () => {
    const doc = buildSampleDocument();
    expect(Object.values(doc.relations).every((r) => r.evidence === 'hypothesis')).toBe(true);
  });
});

describe('F01 활동·주체 생성', () => {
  it('이름만으로 만들 수 있다', () => {
    const doc = fresh();
    const a = addActivity(doc, { name: 'IT학교' });
    const p = addActor(doc, { name: '나' });
    expect(doc.activities[a]).toMatchObject({ name: 'IT학교', status: 'idea' });
    expect(doc.actors[p]).toMatchObject({ kind: 'person' });
  });

  it('이름이 같아도 별개 ID로 남는다', () => {
    const doc = fresh();
    const a = addActivity(doc, { name: 'IT학교' });
    const b = addActivity(doc, { name: 'IT학교' });
    expect(a).not.toBe(b);
    expect(Object.keys(doc.activities)).toHaveLength(2);
  });

  it('빈 이름은 거부한다', () => {
    expect(() => addActivity(fresh(), { name: '' })).toThrow();
  });
});

describe('이름 수정 후 연결 유지 (검증 시나리오 1)', () => {
  it('IT학교 이름을 바꿔도 ID와 관계가 그대로다', () => {
    const doc = buildSampleDocument();
    const before = Object.values(doc.relations).filter((r) => r.from === 'A02' || r.to === 'A02').length;
    updateEntity(doc, 'A02', { name: '디지털 IT학교' });
    expect(doc.activities.A02.name).toBe('디지털 IT학교');
    expect(Object.values(doc.relations).filter((r) => r.from === 'A02' || r.to === 'A02')).toHaveLength(before);
  });

  it('ID는 바꿀 수 없다', () => {
    const doc = buildSampleDocument();
    expect(() => updateEntity(doc, 'A02', { id: 'X' })).toThrow(DomainError);
  });
});

describe('F02 포함 관계', () => {
  it('자기 포함을 막는다', () => {
    const doc = buildSampleDocument();
    expect(() => setParent(doc, 'A02', 'A02')).toThrow(DomainError);
  });

  it('하위 활동을 상위로 두는 순환을 막는다', () => {
    const doc = buildSampleDocument();
    // A12 ⊂ A11 ⊂ A02
    expect(() => setParent(doc, 'A02', 'A12')).toThrow(DomainError);
    expect(() => updateEntity(doc, 'A02', { parentId: 'A11' })).toThrow(DomainError);
    expect(doc.activities.A02.parentId).toBeUndefined();
  });

  it('상위 연결을 해제할 수 있다', () => {
    const doc = buildSampleDocument();
    setParent(doc, 'A11', undefined);
    expect(doc.activities.A11.parentId).toBeUndefined();
  });
});

describe('F03 관계 검증', () => {
  it('종류별 허용 끝점을 지킨다', () => {
    const doc = buildSampleDocument();
    // 참여: 활동 → 주체는 불가
    expect(() => addRelation(doc, { kind: 'participation', from: 'A02', to: 'P01', role: { name: '기획' } })).toThrow(DomainError);
    // 기여: 활동 → 활동은 불가
    expect(() => addRelation(doc, { kind: 'contribution', from: 'A02', to: 'A03' })).toThrow(DomainError);
    // 영향: 요인 → 요인만
    expect(() => addRelation(doc, { kind: 'influence', from: 'A02', to: 'F01', influence: { sign: '+' } })).toThrow(DomainError);
  });

  it('참여 관계는 역할이 필요하고, 활동 간 연결은 종류가 필요하다', () => {
    const doc = buildSampleDocument();
    expect(() => addRelation(doc, { kind: 'participation', from: 'P01', to: 'A03' })).toThrow(DomainError);
    expect(() => addRelation(doc, { kind: 'activityLink', from: 'A01', to: 'A03' })).toThrow(DomainError);
    expect(() => addRelation(doc, { kind: 'activityLink', subtype: 'nonsense', from: 'A01', to: 'A03' })).toThrow(DomainError);
  });

  it('기여 내역은 참여·지원 관계에만 붙는다', () => {
    const doc = buildSampleDocument();
    expect(() =>
      addRelation(doc, { kind: 'activityLink', subtype: 'derive', from: 'A01', to: 'A03', contributions: [{ kind: 'money' }] }),
    ).toThrow(DomainError);
    expect(() =>
      addRelation(doc, { kind: 'activityLink', subtype: 'support', from: 'A01', to: 'A03', contributions: [{ kind: 'money' }] }),
    ).not.toThrow();
  });

  it('기본값은 현재 연결·가설이다', () => {
    const doc = buildSampleDocument();
    const id = addRelation(doc, { kind: 'contribution', from: 'A03', to: 'C02' });
    expect(doc.relations[id]).toMatchObject({ status: 'active', evidence: 'hypothesis' });
  });

  it('완료 활동의 기여도 가설로 남고, 근거를 추가할 수 있다 (검증 시나리오 5)', () => {
    const doc = buildSampleDocument();
    expect(doc.activities.A06.status).toBe('done');
    expect(doc.relations.K05.evidence).toBe('hypothesis');
    updateRelation(doc, 'K05', { evidence: 'observed', evidenceNote: '상담 기록 확인' });
    expect(doc.relations.K05).toMatchObject({ evidence: 'observed', evidenceNote: '상담 기록 확인' });
  });
});

describe('F04 역할과 기여 (검증 시나리오 2)', () => {
  it('한 활동에 여러 주체·역할, 같은 주체의 여러 역할을 허용한다', () => {
    const doc = buildSampleDocument();
    const parts = Object.values(doc.relations).filter((r) => r.kind === 'participation' && r.to === 'A02');
    expect(new Set(parts.map((r) => r.role!.name))).toEqual(new Set(['기획', '교육', '모집', '운영']));
    expect(parts.filter((r) => r.from === 'P01')).toHaveLength(2);
    // 주체 쪽에서도 탐색 가능
    const ofP01 = Object.values(doc.relations).filter((r) => r.kind === 'participation' && r.from === 'P01');
    expect(new Set(ofP01.map((r) => r.to))).toEqual(new Set(['A01', 'A02', 'A03', 'A07']));
  });
});

describe('F09 삭제 영향과 처리', () => {
  it('삭제 전 영향을 보여준다', () => {
    const doc = buildSampleDocument();
    const impact = deleteImpact(doc, 'A02');
    expect(impact.descendants).toEqual(['A11', 'A12']);
    expect(impact.relations).toEqual(expect.arrayContaining(['R01', 'R03', 'K01', 'E01']));
  });

  it('하위 활동이 있으면 처리 방식을 고르지 않고는 삭제하지 않는다', () => {
    const doc = buildSampleDocument();
    expect(() => deleteEntity(doc, 'A02')).toThrow(DomainError);
    expect(doc.activities.A02).toBeDefined();
  });

  it('detach: 하위 활동은 남고 최상위로 이동한다', () => {
    const doc = buildSampleDocument();
    deleteEntity(doc, 'A02', 'detach');
    expect(doc.activities.A02).toBeUndefined();
    expect(doc.activities.A11.parentId).toBeUndefined();
    expect(doc.activities.A12.parentId).toBe('A11');
    expect(Object.values(doc.relations).some((r) => r.from === 'A02' || r.to === 'A02')).toBe(false);
    expect(hasErrors(validateDocument(doc))).toBe(false);
  });

  it('cascade: 하위 활동과 그 관계를 함께 지운다', () => {
    const doc = buildSampleDocument();
    deleteEntity(doc, 'A02', 'cascade');
    expect(doc.activities.A11).toBeUndefined();
    expect(doc.activities.A12).toBeUndefined();
    expect(hasErrors(validateDocument(doc))).toBe(false);
  });
});

describe('시간 규칙 (G2)', () => {
  it('상태에서 시간층을 도출하고 수동 지정이 우선한다', () => {
    expect(timeLayerOf({ status: 'done' })).toBe('past');
    expect(timeLayerOf({ status: 'active' })).toBe('present');
    expect(timeLayerOf({ status: 'idea' })).toBe('future');
    expect(timeLayerOf({ status: 'ongoing', timeLayerOverride: 'past' })).toBe('past');
  });

  it('정밀도가 다른 날짜는 공통 정밀도까지만 비교한다', () => {
    expect(comparePartialDate({ y: 2025 }, { y: 2025, m: 3 })).toBe(0);
    expect(comparePartialDate({ y: 2025, m: 4 }, { y: 2025, m: 3, d: 1 })).toBeGreaterThan(0);
  });

  it('기간 역전은 오류가 아니라 경고로 안내한다', () => {
    const doc = fresh();
    addActivity(doc, { id: 'X', name: 'x', planned: { start: { y: 2026, m: 5 }, end: { y: 2026, m: 2 } } });
    const issues = validateDocument(doc);
    expect(issues).toEqual([expect.objectContaining({ level: 'warning', code: 'activity.plannedReversed' })]);
  });
});

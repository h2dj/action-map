import { describe, expect, it } from 'vitest';
import { updateEntity } from '../../src/domain/ops';
import { buildSampleDocument } from '../../src/fixtures/sample';
import { emptyView, type VNode } from '../../src/views/model';
import { projectCollab } from '../../src/views/collabView';
import { projectPurpose } from '../../src/views/purposeView';
import { hasDates, projectTime } from '../../src/views/timeView';

const entity = (nodes: VNode[], id: string) => nodes.find((n) => n.kind === 'entity' && n.id === id) as Extract<VNode, { kind: 'entity' }> | undefined;
const ids = (nodes: VNode[]) => nodes.filter((n) => n.kind === 'entity').map((n) => n.id);

describe('F05 같은 기록, 여러 보기 (검증 시나리오 1)', () => {
  it('IT학교 이름을 바꾸면 세 보기 모두 같은 ID로 새 이름을 보여준다', () => {
    const doc = buildSampleDocument();
    updateEntity(doc, 'A02', { name: '디지털 IT학교' });
    for (const p of [projectTime(doc, undefined), projectCollab(doc, undefined), projectPurpose(doc, undefined)])
      expect(entity(p.nodes, 'A02')?.label).toBe('디지털 IT학교');
  });
});

describe('시간 보기', () => {
  it('시간층 열에 활동을 배치하고, 상태 규칙을 따른다', () => {
    const doc = buildSampleDocument();
    const p = projectTime(doc, undefined);
    expect(entity(p.nodes, 'A05')?.tone).toBe('past');
    expect(entity(p.nodes, 'A02')?.tone).toBe('present');
    expect(entity(p.nodes, 'A04')?.tone).toBe('future');
    const laneX = (id: string) => p.nodes.find((n) => n.id === id)!.x;
    expect(entity(p.nodes, 'A04')!.x).toBeGreaterThan(laneX('lane:future'));
  });

  it('활동 간 연결과 공통 기반 연결만 그리고, 기여·영향은 그리지 않는다', () => {
    const p = projectTime(buildSampleDocument(), undefined);
    const relIds = p.edges.map((e) => e.relationId);
    expect(relIds).toEqual(expect.arrayContaining(['R01', 'R06', 'R10']));
    expect(relIds.some((r) => r.startsWith('K'))).toBe(false);
    expect(relIds).not.toContain('R13'); // 요인 → 요인 영향
    expect(entity(p.nodes, 'F01')?.tone).toBe('base');
  });

  it('만들고 싶은 연결은 planned 상태로 전달된다', () => {
    const p = projectTime(buildSampleDocument(), undefined);
    expect(p.edges.find((e) => e.relationId === 'R06')?.status).toBe('planned');
  });

  it('날짜가 없으면 날짜 배치를 쓸 수 없고, 날짜가 있으면 기간 순으로 놓는다', () => {
    const doc = buildSampleDocument();
    expect(hasDates(doc)).toBe(false);
    updateEntity(doc, 'A01', { actual: { start: { y: 2022 } } });
    updateEntity(doc, 'A02', { actual: { start: { y: 2025, m: 3 } } });
    updateEntity(doc, 'A04', { planned: { start: { y: 2027 } } });
    const p = projectTime(doc, undefined, 'date');
    expect(entity(p.nodes, 'A01')!.x).toBeLessThan(entity(p.nodes, 'A02')!.x);
    expect(entity(p.nodes, 'A02')!.x).toBeLessThan(entity(p.nodes, 'A04')!.x);
    expect(entity(p.nodes, 'A04')!.tentative).toBe(true);
    expect(entity(p.nodes, 'A02')!.tentative).toBe(false);
    expect(entity(p.nodes, 'A03')!.x).toBeLessThan(entity(p.nodes, 'A01')!.x); // 날짜 미정 열
  });
});

describe('접기 (검증 시나리오 3)', () => {
  it('접힌 활동의 하위는 숨기고, 하위의 관계는 상위로 모아 그린다', () => {
    const doc = buildSampleDocument();
    // A12(⊂A11⊂A02)에 활동 간 연결을 하나 둔다
    doc.relations.X = { id: 'X', kind: 'activityLink', subtype: 'support', from: 'A12', to: 'A08', status: 'active', evidence: 'hypothesis' };
    const open = projectTime(doc, emptyView('time'));
    expect(ids(open.nodes)).toEqual(expect.arrayContaining(['A11', 'A12']));
    expect(open.edges.find((e) => e.relationId === 'X')?.source).toBe('A12');

    const view = { ...emptyView('time'), collapsed: ['A02'] };
    const closed = projectTime(doc, view);
    expect(ids(closed.nodes)).not.toContain('A11');
    expect(ids(closed.nodes)).not.toContain('A12');
    const agg = closed.edges.find((e) => e.relationId === 'X')!;
    expect(agg).toMatchObject({ source: 'A02', target: 'A08', aggregated: true });
    expect(entity(closed.nodes, 'A02')).toMatchObject({ collapsed: true, childCount: 1 });
    // 원본 기록은 그대로
    expect(doc.activities.A12).toBeDefined();
  });
});

describe('협력 보기 (검증 시나리오 2)', () => {
  it('전체 보기: 주체와 활동을 참여 관계(역할·기여)로 잇는다', () => {
    const p = projectCollab(buildSampleDocument(), undefined);
    const e01 = p.edges.find((e) => e.relationId === 'E01')!;
    expect(e01).toMatchObject({ source: 'P01', target: 'A02', label: '기획 · 시간·노동·기술·지식' });
    expect(entity(p.nodes, 'P01')!.x).toBeLessThan(entity(p.nodes, 'A02')!.x);
  });

  it('활동 초점: IT학교의 참여 주체와 역할만', () => {
    const p = projectCollab(buildSampleDocument(), undefined, { focusId: 'A02' });
    expect(new Set(ids(p.nodes))).toEqual(new Set(['A02', 'P01', 'O01', 'O03']));
    expect(p.edges.filter((e) => e.tone === 'role').map((e) => e.label?.split(' · ')[0]).sort()).toEqual(['교육', '기획', '모집', '운영']);
  });

  it('주체 초점: 나의 참여 활동만', () => {
    const p = projectCollab(buildSampleDocument(), undefined, { focusId: 'P01' });
    expect(new Set(ids(p.nodes))).toEqual(new Set(['P01', 'A01', 'A02', 'A03', 'A07']));
  });

  it('기여 종류로 거른다', () => {
    const p = projectCollab(buildSampleDocument(), undefined, { contribution: 'money' });
    expect(p.edges.filter((e) => e.tone === 'role').map((e) => e.relationId)).toEqual(['E07']);
  });
});

describe('목적 보기', () => {
  it('활동 → 변화 → 목적 순서로 열을 나눈다', () => {
    const p = projectPurpose(buildSampleDocument(), undefined);
    const x = (id: string) => entity(p.nodes, id)!.x;
    expect(x('A02')).toBeLessThan(x('C01'));
    expect(x('C01')).toBeLessThan(x('G01'));
    // 여러 활동이 같은 목적, 한 활동이 여러 변화
    expect(p.edges.filter((e) => e.source === 'A02').map((e) => e.target).sort()).toEqual(['C01', 'C02']);
  });

  it('변화 → 변화 기여가 있으면 중간 단계 열이 생긴다 (G5)', () => {
    const doc = buildSampleDocument();
    doc.relations.Y = { id: 'Y', kind: 'contribution', from: 'C01', to: 'C02', status: 'active', evidence: 'hypothesis' };
    const p = projectPurpose(doc, undefined);
    const x = (id: string) => entity(p.nodes, id)!.x;
    expect(x('C01')).toBeLessThan(x('C02'));
    expect(x('C02')).toBeLessThan(x('G02'));
    expect(p.nodes.filter((n) => n.kind === 'lane').map((n) => n.label)).toEqual(['활동', '직접적인 변화', '이어지는 변화 2', '목적']);
  });

  it('기반 기여는 별도 표시된다 (G4)', () => {
    const p = projectPurpose(buildSampleDocument(), undefined);
    expect(p.edges.find((e) => e.relationId === 'K06')?.tone).toBe('enabling');
    expect(p.edges.find((e) => e.relationId === 'K01')?.tone).toBe('contribution');
  });

  it('저장된 위치가 자동 배치보다 우선한다', () => {
    const view = { ...emptyView('purpose'), positions: { A02: { x: 999, y: 555 } } };
    const p = projectPurpose(buildSampleDocument(), view);
    expect(entity(p.nodes, 'A02')).toMatchObject({ x: 999, y: 555 });
  });
});

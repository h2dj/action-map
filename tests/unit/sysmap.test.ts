import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../../src/domain/ops';
import { hasErrors, validateDocument } from '../../src/domain/validate';
import { buildSampleDocument } from '../../src/fixtures/sample';
import { applySysmapImport, parseSysmap, planSysmapImport, TAG_PREFIX, toSysmap } from '../../src/io/sysmap';

/** SysMap에서 직접 그린 지도 (h2dj/sysmap 저장 형식) */
const drawnInSysmap = {
  title: '업무 부담 순환',
  nodes: [
    { id: 'a', shape: 'text', label: '운영 업무량', x: 0, y: 0, w: 100, h: 30, fill: 'transparent', stroke: '#000' },
    { id: 'b', shape: 'text', label: '회복 여력', x: 200, y: 0, w: 100, h: 30, fill: 'transparent', stroke: '#000' },
    { id: 'c', shape: 'rect', label: '역할 분담', x: 100, y: 200, w: 150, h: 90, fill: '#eef', stroke: '#00f' },
    { id: 'loop1', shape: 'loop', label: 'B1', loopType: 'B', x: 120, y: 80, w: 50, h: 30 },
    { id: 'note', shape: 'bubble', label: '가설입니다', x: 400, y: 0, w: 180, h: 120 },
  ],
  edges: [
    { id: 'e1', from: 'a', to: 'b', label: '', dashed: false, arrowStart: false, arrowEnd: true, bend: 20, delay: false, polarity: '-', bubble: false, color: '' },
    { id: 'e2', from: 'b', to: 'c', label: '', dashed: false, arrowStart: false, arrowEnd: true, bend: 20, delay: true, polarity: '+', bubble: false, color: '' },
    { id: 'e3', from: 'c', to: 'a', label: '', dashed: true, arrowStart: false, arrowEnd: true, bend: 20, delay: false, polarity: '', bubble: false, color: '' },
    { id: 'e4', from: 'note', to: 'a', label: '', dashed: false, arrowStart: false, arrowEnd: false, bend: 0, delay: false, polarity: '', bubble: true, color: '' },
    { id: 'e5', from: 'a', to: 'a', label: '', dashed: false, arrowStart: false, arrowEnd: true, bend: -70, delay: false, polarity: '+', bubble: false, color: '' },
  ],
};

describe('SysMap 가져오기', () => {
  it('노드를 변화 요인으로, 연결선을 극성·지연이 있는 영향 관계로 옮긴다', () => {
    const doc = createEmptyDocument('t');
    const parsed = parseSysmap(JSON.stringify(drawnInSysmap));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = planSysmapImport(doc, parsed.state);
    applySysmapImport(doc, plan);

    const factors = Object.values(doc.factors);
    expect(factors.map((f) => f.name).sort()).toEqual(['역할 분담', '운영 업무량', '회복 여력']);
    expect(factors.find((f) => f.name === '역할 분담')?.sharedBase).toBe(true);

    const rels = Object.values(doc.relations);
    expect(rels).toHaveLength(3);
    const byName = (n: string) => factors.find((f) => f.name === n)!.id;
    const e1 = rels.find((r) => r.from === byName('운영 업무량') && r.to === byName('회복 여력'))!;
    expect(e1).toMatchObject({ kind: 'influence', influence: { sign: '-' }, evidence: 'hypothesis', status: 'active' });
    const e2 = rels.find((r) => r.from === byName('회복 여력'))!;
    expect(e2.influence).toEqual({ sign: '+', delayed: true });
    const e3 = rels.find((r) => r.from === byName('역할 분담'))!;
    expect(e3).toMatchObject({ influence: { sign: '?' }, status: 'planned' });

    expect(hasErrors(validateDocument(doc))).toBe(false);
    expect(doc.views.loop.positions[byName('운영 업무량')]).toEqual({ x: 50, y: 15 });
  });

  it('루프 라벨·말풍선·자기 참조는 옮기지 않고 알린다', () => {
    const parsed = parseSysmap(JSON.stringify(drawnInSysmap));
    if (!parsed.ok) throw new Error();
    const plan = planSysmapImport(createEmptyDocument('t'), parsed.state);
    expect(plan.issues.map((i) => i.code).sort()).toEqual(['sysmap.bubbles', 'sysmap.loopLabels', 'sysmap.selfLoop']);
  });

  it('이름이 같아도 태그가 없으면 합치지 않는다', () => {
    const doc = buildSampleDocument(); // '운영 업무량' 요인(F02)이 이미 있음
    const parsed = parseSysmap(JSON.stringify(drawnInSysmap));
    if (!parsed.ok) throw new Error();
    applySysmapImport(doc, planSysmapImport(doc, parsed.state));
    expect(Object.values(doc.factors).filter((f) => f.name === '운영 업무량')).toHaveLength(2);
  });

  it('SysMap 형식이 아니면 거부한다', () => {
    expect(parseSysmap('{"nodes": 1}')).toMatchObject({ ok: false });
    expect(parseSysmap('oops')).toMatchObject({ ok: false });
  });
});

describe('SysMap 내보내기와 왕복', () => {
  it('요인과 연결된 활동을 태그와 함께 내보낸다', () => {
    const doc = buildSampleDocument();
    const sm = toSysmap(doc);
    const f01 = sm.nodes.find((n) => n.tags?.includes(`${TAG_PREFIX}F01`))!;
    expect(f01).toMatchObject({ shape: 'rect', label: '나의 시간·주의력·회복 여력' }); // 공통 기반
    expect(sm.nodes.find((n) => n.tags?.includes(`${TAG_PREFIX}F02`))?.shape).toBe('text');
    expect(sm.nodes.find((n) => n.tags?.includes(`${TAG_PREFIX}A07`))?.shape).toBe('circle');
    const r12 = sm.edges.find((e) => e.id === 'e_R12')!;
    expect(r12).toMatchObject({ polarity: '+', dashed: true }); // 만들고 싶은 연결
    // SysMap이 그대로 읽을 수 있는 형식
    expect(parseSysmap(JSON.stringify(sm)).ok).toBe(true);
  });

  it('SysMap에서 선을 더 그려 돌아오면 새 관계만 추가되고 기존 기록은 그대로다', () => {
    const doc = buildSampleDocument();
    const sm = toSysmap(doc);
    // SysMap에서 사용자가 F03 → F02 영향(+)과 새 변수를 추가하고, F02 이름을 바꿨다고 가정
    sm.nodes.push({ id: 'new', shape: 'text', label: '교육 적합성', x: 0, y: 0, w: 80, h: 30 });
    sm.edges.push({ id: 'x1', from: 'n_F03', to: 'new', polarity: '+' });
    sm.edges.push({ id: 'x2', from: 'n_F03', to: 'n_F02', polarity: '+' });
    sm.nodes.find((n) => n.id === 'n_F02')!.label = '운영 업무 부담';

    const before = structuredClone(doc.relations);
    const plan = planSysmapImport(doc, sm);
    applySysmapImport(doc, plan);

    expect(plan.newFactors.map((f) => f.name)).toEqual(['교육 적합성']);
    expect(plan.newRelations).toHaveLength(2);
    expect(plan.issues.map((i) => i.code)).toContain('sysmap.renamed');
    expect(doc.factors.F02.name).toBe('운영 업무량');
    for (const [id, r] of Object.entries(before)) expect(doc.relations[id]).toEqual(r);
    expect(hasErrors(validateDocument(doc))).toBe(false);
  });
});

describe('SysMap 내보내기: 순환 라벨', () => {
  it('판정된 순환을 루프 라벨(R/B)로 내보내고, 다시 가져와도 기록은 늘지 않는다', () => {
    const doc = buildSampleDocument();
    const sm = toSysmap(doc);
    const loops = sm.nodes.filter((n) => n.shape === 'loop');
    expect(loops.map((n) => [n.label, n.loopType]).sort()).toEqual([
      ['B1 성장의 한계', 'B'],
      ['R1 과부하', 'R'],
      ['R2 현장 배움', 'R'],
    ]);
    const plan = planSysmapImport(doc, sm);
    expect(plan.newFactors).toEqual([]);
    expect(plan.newRelations).toEqual([]);
  });
});

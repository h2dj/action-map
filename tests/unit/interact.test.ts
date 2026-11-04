import { describe, expect, it } from 'vitest';
import { buildSampleDocument } from '../../src/fixtures/sample';
import { chooseSides, filterEdges, nearestInDirection, searchNodes } from '../../src/views/interact';
import type { VNode } from '../../src/views/model';
import { projectPurpose } from '../../src/views/purposeView';
import { projectTime } from '../../src/views/timeView';

const box = (id: string, x: number, y: number): VNode => ({ kind: 'entity', id, entityType: 'activity', label: id, tone: 'present', x, y, w: 200, h: 60 });

describe('연결선 접점', () => {
  it('옆 열이면 좌우, 같은 열이면 위아래', () => {
    expect(chooseSides(box('a', 0, 0), box('b', 400, 0))).toEqual({ source: 'r', target: 'l' });
    expect(chooseSides(box('a', 400, 0), box('b', 0, 0))).toEqual({ source: 'l', target: 'r' });
    expect(chooseSides(box('a', 0, 0), box('b', 10, 80))).toEqual({ source: 'b', target: 't' });
    expect(chooseSides(box('a', 0, 80), box('b', 0, 0))).toEqual({ source: 't', target: 'b' });
  });
  it('같은 열에서 사이에 노드가 있을 만큼 멀면 바깥으로 돌아간다', () => {
    expect(chooseSides(box('a', 0, 0), box('b', 0, 200))).toEqual({ source: 'r', target: 'r' });
  });
});

describe('방향키 이동', () => {
  const nodes = [box('c', 300, 300), box('r', 700, 310), box('l', 0, 280), box('u', 310, 0), box('d', 290, 600), box('far', 700, 900)];
  it('그 방향의 가장 가까운 노드로', () => {
    expect(nearestInDirection(nodes, 'c', 'right')).toBe('r');
    expect(nearestInDirection(nodes, 'c', 'left')).toBe('l');
    expect(nearestInDirection(nodes, 'c', 'up')).toBe('u');
    expect(nearestInDirection(nodes, 'c', 'down')).toBe('d');
    expect(nearestInDirection(nodes, 'l', 'left')).toBeUndefined();
  });
  it('선택이 없으면 첫 노드', () => {
    expect(nearestInDirection(nodes, 'none', 'right')).toBe('c');
  });
});

describe('관계 필터', () => {
  it('진행 상태와 근거 수준으로 거른다', () => {
    const doc = buildSampleDocument();
    doc.relations.R01.evidence = 'observed';
    doc.relations.R03.evidence = 'confirmed';
    const { edges } = projectTime(doc, undefined);
    expect(filterEdges(edges, { status: 'planned', minEvidence: 'hypothesis' }).every((e) => e.status === 'planned')).toBe(true);
    expect(filterEdges(edges, { status: 'all', minEvidence: 'observed' }).map((e) => e.relationId).sort()).toEqual(['R01', 'R03']);
    expect(filterEdges(edges, { status: 'all', minEvidence: 'confirmed' }).map((e) => e.relationId)).toEqual(['R03']);
  });
});

describe('지도 검색', () => {
  it('이름·설명에 모든 단어가 들어간 노드', () => {
    const { nodes } = projectPurpose(buildSampleDocument(), undefined);
    expect(searchNodes(nodes, '자율성').sort()).toEqual(['C02', 'G02']);
    expect(searchNodes(nodes, '시민 자율성')).toEqual(['G02']);
    expect(searchNodes(nodes, '  ')).toEqual([]);
  });
});

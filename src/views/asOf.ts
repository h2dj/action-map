/**
 * 과거 시점 조회 (3단계): 기준 시점에 유효했던 활동과 관계만 남긴다.
 * - 활동: 실제 기간(없으면 예정 기간)이 기준 시점을 포함해야 한다. 날짜가 전혀 없는 활동은 판단할 수 없어 남기고 표시한다.
 * - 관계: 유효 기간이 있으면 기준 시점을 포함해야 한다. 없으면 양 끝이 보일 때 남긴다.
 * 문서 수정 이력을 되감는 기능이 아니라, 기록된 기간으로 그 시점의 모습을 추정하는 기능이다.
 */
import type { Activity, DateRange, Id, MapDocument, PartialDate } from '../domain/schema';
import type { Projection } from './model';

/** 기준 시점: 연·월 (월 생략 시 그 해 전체) */
export type AsOf = { y: number; m?: number };

const startIdx = (d: PartialDate) => d.y * 12 + ((d.m ?? 1) - 1);
const endIdx = (d: PartialDate) => d.y * 12 + ((d.m ?? 12) - 1);

/** 기간이 기준 시점과 겹치는지. 시작만 있으면 그 뒤로 계속 이어진다고 본다. */
export function rangeCovers(range: DateRange | undefined, at: AsOf): boolean | undefined {
  if (!range?.start && !range?.end) return undefined;
  const from = at.y * 12 + ((at.m ?? 1) - 1);
  const to = at.y * 12 + ((at.m ?? 12) - 1);
  const s = range.start ? startIdx(range.start) : -Infinity;
  const e = range.end ? endIdx(range.end) : Infinity;
  return s <= to && e >= from;
}

export type ActivityAtTime = 'active' | 'inactive' | 'undated';

export function activityAt(a: Activity, at: AsOf): ActivityAtTime {
  const span = a.actual?.start || a.actual?.end ? a.actual : a.planned;
  const covers = rangeCovers(span, at);
  if (covers === undefined) return 'undated';
  return covers ? 'active' : 'inactive';
}

export function parseAsOf(text: string): AsOf | undefined {
  const m = /^\s*(\d{4})(?:[-./]\s*(\d{1,2}))?\s*$/.exec(text);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = m[2] ? Number(m[2]) : undefined;
  if (y < 1900 || y > 2200 || (mo !== undefined && (mo < 1 || mo > 12))) return undefined;
  return mo ? { y, m: mo } : { y };
}

export const formatAsOf = (at: AsOf) => (at.m ? `${at.y}년 ${at.m}월` : `${at.y}년`);

/** 보기 투영에서 기준 시점에 유효하지 않은 활동·관계를 뺀다 */
export function filterProjectionAsOf(doc: MapDocument, p: Projection, at: AsOf): Projection {
  const hidden = new Set<Id>();
  let undated = 0;
  for (const n of p.nodes) {
    if (n.kind !== 'entity' || n.entityType !== 'activity') continue;
    const state = activityAt(doc.activities[n.id], at);
    if (state === 'inactive') hidden.add(n.id);
    if (state === 'undated') undated++;
  }
  const nodes = p.nodes
    .filter((n) => !hidden.has(n.id))
    .map((n) =>
      n.kind === 'entity' && n.entityType === 'activity' && activityAt(doc.activities[n.id], at) === 'undated'
        ? { ...n, tentative: true }
        : n,
    );
  let hiddenEdges = 0;
  const edges = p.edges.filter((e) => {
    if (hidden.has(e.source) || hidden.has(e.target)) return false;
    const valid = rangeCovers(doc.relations[e.relationId]?.validity, at);
    if (valid === false) {
      hiddenEdges++;
      return false;
    }
    return true;
  });
  const notes = [
    `${formatAsOf(at)} 기준: 그때 진행하지 않은 활동 ${hidden.size}개${hiddenEdges ? `, 유효 기간 밖의 관계 ${hiddenEdges}개` : ''}를 숨겼습니다. 기록된 기간으로 추정한 모습입니다.`,
    ...(undated ? [`날짜가 없는 활동 ${undated}개는 판단할 수 없어 점선 테두리로 남겼습니다.`] : []),
    ...p.notes,
  ];
  return { nodes, edges, notes };
}

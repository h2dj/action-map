import type { Activity, ActivityStatus, DateRange, PartialDate, TimeLayer } from './schema';

/**
 * G2: 활동 상태 → 시간층 기본 규칙.
 * 완료 → 해온 일, 진행·지속·중단 → 진행 중, 구상·예정 → 하려는 일.
 */
const statusLayer: Record<ActivityStatus, TimeLayer> = {
  done: 'past',
  active: 'present',
  ongoing: 'present',
  paused: 'present',
  idea: 'future',
  planned: 'future',
};

export function timeLayerOf(activity: Pick<Activity, 'status' | 'timeLayerOverride'>): TimeLayer {
  return activity.timeLayerOverride ?? statusLayer[activity.status];
}

/**
 * 두 날짜를 공통으로 알려진 정밀도까지만 비교한다.
 * 한쪽 정밀도가 낮아 판단할 수 없으면 0(같음)으로 본다.
 */
export function comparePartialDate(a: PartialDate, b: PartialDate): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m === undefined || b.m === undefined) return 0;
  if (a.m !== b.m) return a.m - b.m;
  if (a.d === undefined || b.d === undefined) return 0;
  return a.d - b.d;
}

export function isReversed(range: DateRange | undefined): boolean {
  if (!range?.start || !range.end) return false;
  return comparePartialDate(range.start, range.end) > 0;
}

export function formatPartialDate(d: PartialDate | undefined): string {
  if (!d) return '미정';
  const pad = (n: number) => String(n).padStart(2, '0');
  return [String(d.y), d.m && pad(d.m), d.m && d.d && pad(d.d)].filter(Boolean).join('.');
}

import { describe, expect, it } from 'vitest';
import { parsePartialDate } from '../../src/ui/fields';

describe('날짜 입력 해석', () => {
  it('아는 만큼의 정밀도로 읽는다', () => {
    expect(parsePartialDate('2026')).toEqual({ y: 2026 });
    expect(parsePartialDate('2026-3')).toEqual({ y: 2026, m: 3 });
    expect(parsePartialDate('2026.03.15')).toEqual({ y: 2026, m: 3, d: 15 });
    expect(parsePartialDate('  ')).toBeUndefined();
  });
  it('형식이나 범위가 틀리면 invalid', () => {
    expect(parsePartialDate('2026-13')).toBe('invalid');
    expect(parsePartialDate('26-03')).toBe('invalid');
    expect(parsePartialDate('내년')).toBe('invalid');
  });
});

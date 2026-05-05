import { describe, it, expect } from 'vitest';
import {
  dailySeedFor,
  isValidDailyDate,
  todayDateJst,
  yesterdayDateJst,
} from '../dailySeed';

describe('dailySeedFor', () => {
  it('is deterministic for the same input', () => {
    const a = dailySeedFor('2026-05-06');
    const b = dailySeedFor('2026-05-06');
    expect(a).toBe(b);
  });

  it('produces a non-negative 31-bit integer', () => {
    const v = dailySeedFor('2026-05-06');
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(2 ** 31);
  });

  it('differs for adjacent dates (avalanche-ish)', () => {
    // Trivial collision is theoretically possible but vanishingly unlikely
    // for FNV-1a on adjacent strings. Sample a handful of consecutive days
    // and assert they're all distinct.
    const seeds = [
      '2026-05-05',
      '2026-05-06',
      '2026-05-07',
      '2026-05-08',
    ].map(dailySeedFor);
    expect(new Set(seeds).size).toBe(seeds.length);
  });
});

describe('todayDateJst', () => {
  it('returns YYYY-MM-DD format', () => {
    const s = todayDateJst();
    expect(/^\d{4}-\d{2}-\d{2}$/.test(s)).toBe(true);
  });

  it('rolls over at JST midnight, not UTC midnight', () => {
    // 2026-05-06 14:00 UTC = 2026-05-06 23:00 JST → still "2026-05-06" JST.
    const beforeMidnight = new Date(Date.UTC(2026, 4, 6, 14, 0, 0));
    expect(todayDateJst(beforeMidnight)).toBe('2026-05-06');
    // 2026-05-06 15:00 UTC = 2026-05-07 00:00 JST → rolls to "2026-05-07".
    const afterMidnight = new Date(Date.UTC(2026, 4, 6, 15, 0, 0));
    expect(todayDateJst(afterMidnight)).toBe('2026-05-07');
  });

  it('handles month boundary correctly', () => {
    // 2026-04-30 23:30 JST = 2026-04-30 14:30 UTC.
    const lastDay = new Date(Date.UTC(2026, 3, 30, 14, 30, 0));
    expect(todayDateJst(lastDay)).toBe('2026-04-30');
    // 2026-05-01 00:30 JST = 2026-04-30 15:30 UTC.
    const firstDay = new Date(Date.UTC(2026, 3, 30, 15, 30, 0));
    expect(todayDateJst(firstDay)).toBe('2026-05-01');
  });
});

describe('yesterdayDateJst', () => {
  it('returns the previous JST day', () => {
    // 2026-05-06 12:00 UTC = 2026-05-06 21:00 JST → today=05-06, yesterday=05-05.
    const now = new Date(Date.UTC(2026, 4, 6, 12, 0, 0));
    expect(yesterdayDateJst(now)).toBe('2026-05-05');
  });

  it('crosses a month boundary', () => {
    // 2026-05-01 00:30 JST → yesterday should be 2026-04-30.
    const firstOfMonth = new Date(Date.UTC(2026, 3, 30, 15, 30, 0));
    expect(todayDateJst(firstOfMonth)).toBe('2026-05-01');
    expect(yesterdayDateJst(firstOfMonth)).toBe('2026-04-30');
  });
});

describe('isValidDailyDate', () => {
  it('accepts well-formed dates', () => {
    expect(isValidDailyDate('2026-05-06')).toBe(true);
    expect(isValidDailyDate('2024-02-29')).toBe(true); // leap year
  });

  it('rejects malformed strings', () => {
    expect(isValidDailyDate('2026-5-6')).toBe(false);
    expect(isValidDailyDate('not-a-date')).toBe(false);
    expect(isValidDailyDate('')).toBe(false);
    expect(isValidDailyDate(undefined)).toBe(false);
    expect(isValidDailyDate(20260506 as unknown)).toBe(false);
  });

  it('rejects nonexistent calendar dates', () => {
    expect(isValidDailyDate('2026-02-30')).toBe(false);
    expect(isValidDailyDate('2026-13-01')).toBe(false);
    expect(isValidDailyDate('2025-02-29')).toBe(false); // not a leap year
  });
});

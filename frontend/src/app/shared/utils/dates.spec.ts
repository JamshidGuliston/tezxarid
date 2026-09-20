import { dayNumber, formatDayMonth, formatDayMonthYear, parseIsoDate, todayIso, weekdayShort } from './dates';

describe('dates', () => {
  it('parses ISO dates as local dates', () => {
    const d = parseIsoDate('2026-09-12');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 12]);
  });

  it('gives short Uzbek weekday names', () => {
    expect(weekdayShort('2026-09-12')).toBe('Sha'); // Saturday
    expect(weekdayShort('2026-09-13')).toBe('Ya');  // Sunday
    expect(weekdayShort('2026-09-14')).toBe('Du');  // Monday
    expect(weekdayShort('oops')).toBe('');
  });

  it('formats day + month', () => {
    expect(formatDayMonth('2026-09-12')).toBe('12-sentabr');
    expect(dayNumber('2026-09-05')).toBe(5);
  });

  it('todayIso matches the local date', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayIso()).toBe(expected);
  });

  it('formats a datetime as day-month, year', () => {
    // 12:00 UTC — the same calendar day in every zone from UTC-11 to UTC+11, so this fixture is timezone-robust.
    expect(formatDayMonthYear('2026-09-20T17:00:00+05:00')).toBe('20-sentabr, 2026');
  });
});

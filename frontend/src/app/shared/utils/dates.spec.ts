import { dayNumber, formatDayMonth, parseIsoDate, todayIso, weekdayShort } from './dates';

describe('dates', () => {
  it('parses ISO dates as local dates', () => {
    const d = parseIsoDate('2026-09-12');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 12]);
  });

  it('gives short Uzbek weekday names', () => {
    expect(weekdayShort('2026-09-12')).toBe('Sha'); // Saturday
    expect(weekdayShort('2026-09-13')).toBe('Ya');  // Sunday
    expect(weekdayShort('2026-09-14')).toBe('Du');  // Monday
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
});

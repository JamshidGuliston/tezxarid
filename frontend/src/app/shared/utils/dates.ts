/** Small date helpers for 'YYYY-MM-DD' strings, interpreted as LOCAL dates (no UTC shift). */
export const WEEKDAYS_SHORT = ['Ya', 'Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha']; // index = Date.getDay()
export const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS_SHORT[parseIsoDate(iso).getDay()] ?? '';
}

export function dayNumber(iso: string): number {
  return parseIsoDate(iso).getDate();
}

export function formatDayMonth(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getDate()}-${MONTHS[d.getMonth()] ?? ''}`;
}

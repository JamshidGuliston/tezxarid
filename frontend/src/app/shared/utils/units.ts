/** API unit code → label shown to the user (Latin Uzbek). */
export const UNIT_LABELS: Record<string, string> = {
  kg: 'kg',
  sht: 'dona',
  l: 'l',
  g: 'g',
  boglam: "bog'lam",
};

export function unitLabel(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}

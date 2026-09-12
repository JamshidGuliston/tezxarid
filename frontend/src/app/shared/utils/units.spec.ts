import { unitLabel } from './units';

describe('unitLabel', () => {
  it('maps API unit codes to Latin Uzbek labels', () => {
    expect(unitLabel('kg')).toBe('kg');
    expect(unitLabel('sht')).toBe('dona');
    expect(unitLabel('l')).toBe('l');
    expect(unitLabel('g')).toBe('g');
    expect(unitLabel('boglam')).toBe("bog'lam");
  });

  it('falls back to the raw code', () => {
    expect(unitLabel('box')).toBe('box');
  });
});

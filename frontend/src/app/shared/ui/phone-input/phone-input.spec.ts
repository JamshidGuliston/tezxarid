import { TestBed } from '@angular/core/testing';
import { PhoneInput, formatDigits, normalizePhone } from './phone-input';

describe('PhoneInput helpers', () => {
  it('normalizePhone keeps the 9 national digits', () => {
    expect(normalizePhone('+998901234567')).toBe('901234567');
    expect(normalizePhone('90 123 45 67')).toBe('901234567');
    expect(normalizePhone('9012')).toBe('9012');
    expect(normalizePhone('90123456789')).toBe('901234567');
  });

  it('formatDigits groups 2-3-2-2', () => {
    expect(formatDigits('901234567')).toBe('90 123 45 67');
    expect(formatDigits('9012')).toBe('90 12');
    expect(formatDigits('')).toBe('');
  });
});

describe('PhoneInput', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [PhoneInput] }));

  it('emits +998XXXXXXXXX only when 9 digits are typed, and formats the display', async () => {
    const fixture = TestBed.createComponent(PhoneInput);
    const values: string[] = [];
    fixture.componentInstance.registerOnChange((v: string) => values.push(v));
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.value = '9012';
    input.dispatchEvent(new Event('input'));
    input.value = '901234567';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(values).toEqual(['', '+998901234567']);
    expect(input.value).toBe('90 123 45 67');
  });

  it('writeValue shows the national part of a stored number', async () => {
    const fixture = TestBed.createComponent(PhoneInput);
    fixture.componentInstance.writeValue('+998901234567');
    fixture.detectChanges();
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('90 123 45 67');
    expect(fixture.nativeElement.textContent).toContain('+998');
  });
});

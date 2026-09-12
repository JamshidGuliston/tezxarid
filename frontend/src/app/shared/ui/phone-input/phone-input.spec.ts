import { TestBed } from '@angular/core/testing';
import { PhoneInput, formatDigits, normalizePhone } from './phone-input';

describe('PhoneInput helpers', () => {
  it('normalizePhone keeps the 9 national digits', () => {
    expect(normalizePhone('+998901234567')).toBe('901234567');
    expect(normalizePhone('90 123 45 67')).toBe('901234567');
    expect(normalizePhone('9012')).toBe('9012');
    expect(normalizePhone('90123456789')).toBe('901234567');
    expect(normalizePhone('8 90 123 45 67')).toBe('901234567');
    expect(normalizePhone('0901234567')).toBe('901234567');
    expect(normalizePhone('+998 99 890 12 34')).toBe('998901234');
    expect(normalizePhone('8812345679', '881234567')).toBe('881234567');
    expect(normalizePhone('9989012345', '998901234')).toBe('998901234');
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

  it('rewrites the DOM value even when the input was rejected', async () => {
    const fixture = TestBed.createComponent(PhoneInput);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '901234567';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    input.value = '90 123 45 67x';   // 10th character: signal unchanged, DOM must still be normalized
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(input.value).toBe('90 123 45 67');
  });

  it('shows nothing for a stored value it cannot represent, and clears on null', async () => {
    const fixture = TestBed.createComponent(PhoneInput);
    fixture.componentInstance.writeValue('+79161234567');
    fixture.detectChanges();
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('');
    fixture.componentInstance.writeValue('+998901234567');
    fixture.componentInstance.writeValue(null);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.value).toBe('');
  });

  it('disables the native input and reports touch on blur', async () => {
    const fixture = TestBed.createComponent(PhoneInput);
    let touched = false;
    fixture.componentInstance.registerOnTouched(() => (touched = true));
    fixture.componentInstance.setDisabledState(true);
    fixture.detectChanges();
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    input.dispatchEvent(new Event('blur'));
    expect(touched).toBe(true);
  });

  it('ignores a 10th digit typed after a complete 88… number', async () => {
    const fixture = TestBed.createComponent(PhoneInput);
    const values: string[] = [];
    fixture.componentInstance.registerOnChange((v: string) => values.push(v));
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '881234567';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    input.value = '88 123 45 679';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.value).toBe('88 123 45 67');
    expect(values).toEqual(['+998881234567', '+998881234567']);
  });
});

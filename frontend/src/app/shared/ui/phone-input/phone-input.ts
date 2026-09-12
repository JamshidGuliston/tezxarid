import { Component, computed, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Strip everything but digits, drop a country/trunk prefix from a *pasted* long number, keep at most 9 digits.
 *  `previous` is the digits already in the field: when the user merely typed past 9 digits, the extra
 *  keystroke is ignored instead of re-interpreting the number. */
export function normalizePhone(raw: string, previous = ''): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 9) {
    if (previous.length === 9 && digits.startsWith(previous)) return previous;   // typing overflow
    if (digits.startsWith('998')) digits = digits.slice(3);                       // country code
    else if (digits.length === 10 && /^[08]/.test(digits)) digits = digits.slice(1); // trunk 8 / 0
  }
  return digits.slice(0, 9);
}

/** '901234567' → '90 123 45 67' (partial input is grouped as far as it goes). */
export function formatDigits(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(' ');
}

@Component({
  selector: 'tx-phone-input',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PhoneInput), multi: true }],
  template: `
    <div class="phone" [class.disabled]="disabled()">
      <span class="prefix">+998</span>
      <input type="tel" inputmode="numeric" autocomplete="tel-national"
        placeholder="90 123 45 67" [value]="display()" [disabled]="disabled()"
        (input)="onInput($event)" (blur)="onTouched()" />
    </div>
  `,
  styles: [`
    .phone { display: flex; align-items: center; gap: .5rem; background: #f3f3f3; border-radius: 14px; padding: 0 .9rem; }
    .phone:focus-within { outline: 2px solid #F60; outline-offset: 2px; }
    .prefix { font-weight: 600; color: #333; }
    input { flex: 1; border: none; background: transparent; padding: .9rem 0; font-size: 1rem; outline: none; }
    .disabled { color: #767676; }
    .disabled .prefix { color: #767676; }
  `],
})
export class PhoneInput implements ControlValueAccessor {
  digits = signal('');
  disabled = signal(false);
  display = computed(() => formatDigits(this.digits()));

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  onInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    const digits = normalizePhone(el.value, this.digits());
    this.digits.set(digits);
    // Rewrite the DOM too: when the input was rejected (10th digit, a letter) the signal doesn't change, so the [value] binding won't fire.
    el.value = formatDigits(digits);
    // The form only ever sees a complete number or '' (so `required` covers "incomplete").
    this.onChange(digits.length === 9 ? `+998${digits}` : '');
  }

  writeValue(value: string | null): void {
    const digits = normalizePhone(value ?? '');
    // A value we cannot represent (e.g. a foreign number seeded from storage) is shown as empty.
    this.digits.set(value && `+998${digits}` !== value ? '' : digits);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}

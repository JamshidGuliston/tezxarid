import { Component, computed, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Strip everything but digits, drop a leading country code, keep at most 9 national digits. */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length > 9) digits = digits.slice(3);
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
    .phone { display: flex; align-items: center; gap: .5rem; background: #f6f7f9; border-radius: 12px;
      padding: 0 .9rem; }
    .prefix { font-weight: 600; color: #333; }
    input { flex: 1; border: none; background: transparent; padding: .9rem 0; font-size: 1rem; outline: none; }
    .disabled { opacity: .6; }
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
    const digits = normalizePhone(el.value);
    this.digits.set(digits);
    el.value = formatDigits(digits);
    // The form only ever sees a complete number or '' (so `required` covers "incomplete").
    this.onChange(digits.length === 9 ? `+998${digits}` : '');
  }

  writeValue(value: string | null): void {
    this.digits.set(normalizePhone(value ?? ''));
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

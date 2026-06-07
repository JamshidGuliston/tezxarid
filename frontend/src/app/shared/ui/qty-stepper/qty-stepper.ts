import { Component, input, output } from '@angular/core';

const UNIT_LABELS: Record<string, string> = {
  kg: 'кг', sht: 'дона', l: 'литр', g: 'грамм', boglam: 'боғлам',
};

@Component({
  selector: 'tx-qty-stepper',
  standalone: true,
  template: `
    <div class="stepper">
      <button type="button" (click)="dec.emit()" aria-label="kamaytirish">−</button>
      <span class="val">{{ qty() }} {{ label() }}</span>
      <button type="button" (click)="inc.emit()" aria-label="ko'paytirish">+</button>
    </div>
  `,
  styles: [`
    .stepper { display: inline-flex; align-items: center; gap: .5rem;
      background: #f2f2f2; border-radius: 999px; padding: .25rem .5rem; }
    .stepper button { width: 1.75rem; height: 1.75rem; border: none; border-radius: 50%;
      background: #fff; font-size: 1.1rem; line-height: 1; cursor: pointer; }
    .val { min-width: 3.5rem; text-align: center; font-weight: 600; }
  `],
})
export class QtyStepper {
  qty = input.required<number>();
  unit = input<string>('');
  inc = output<void>();
  dec = output<void>();

  label(): string {
    return UNIT_LABELS[this.unit()] ?? this.unit();
  }
}

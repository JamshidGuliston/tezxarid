import { Component, computed, input, output } from '@angular/core';
import { Product } from '../../../core/api/models/catalog.models';
import { SumPipe } from '../../pipes/sum.pipe';
import { QtyStepper } from '../qty-stepper/qty-stepper';

const UNIT_LABELS: Record<string, string> = {
  kg: 'кг', sht: 'дона', l: 'литр', g: 'грамм', boglam: 'боғлам',
};

@Component({
  selector: 'tx-product-card',
  standalone: true,
  imports: [SumPipe, QtyStepper],
  template: `
    <article class="card">
      <div class="img" [style.backgroundImage]="bg()">
        @if (qty() > 0) {
          <tx-qty-stepper class="overlay" [qty]="qty()" [unit]="product().unit"
            (inc)="inc.emit()" (dec)="dec.emit()" />
        } @else {
          <button type="button" class="add-btn" (click)="add.emit()" aria-label="qo'shish">+</button>
        }
      </div>
      <div class="price">{{ product().price | sum }}</div>
      <div class="name">{{ product().name }}</div>
      <div class="unit">1 {{ unitLabel() }}</div>
    </article>
  `,
  styles: [`
    .card { display: flex; flex-direction: column; }
    .img { position: relative; aspect-ratio: 1; border-radius: 14px;
      background: #f5f5f5 center/cover no-repeat; margin-bottom: .4rem; }
    .add-btn, .overlay { position: absolute; right: .5rem; bottom: .5rem; }
    .add-btn { width: 2.25rem; height: 2.25rem; border-radius: 50%; border: none;
      background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.15); font-size: 1.4rem; cursor: pointer; }
    .price { font-weight: 700; }
    .name { font-size: .95rem; }
    .unit { color: #9a9a9a; font-size: .85rem; }
  `],
})
export class ProductCard {
  product = input.required<Product>();
  qty = input<number>(0);
  add = output<void>();
  inc = output<void>();
  dec = output<void>();

  bg = computed(() => (this.product().image ? `url(${this.product().image})` : 'none'));
  unitLabel = computed(() => UNIT_LABELS[this.product().unit] ?? this.product().unit);
}

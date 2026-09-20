import { Component, computed, input, signal } from '@angular/core';
import { Order } from '../../../core/api/models/order.models';
import { SumPipe } from '../../pipes/sum.pipe';
import { formatDayMonth } from '../../utils/dates';
import { stageLabel } from '../../utils/order-status';
import { unitLabel } from '../../utils/units';

@Component({
  selector: 'tx-order-card',
  standalone: true,
  imports: [SumPipe],
  template: `
    <article class="card">
      <button type="button" class="head" (click)="open.set(!open())" [attr.aria-expanded]="open()">
        <div class="top">
          <b>№ {{ order().id }}</b>
          <span class="status" [class]="'status s-' + order().status">{{ statusLabel() }}</span>
        </div>
        <div class="when">{{ when() }}</div>
        @if (progress(); as pct) {
          <div class="progress" role="img" [attr.aria-label]="statusLabel()"><span [style.width.%]="pct"></span></div>
        }
        <div class="total">{{ order().total | sum }}</div>
      </button>
      @if (open()) {
        <ul class="items">
          @for (i of order().items; track i.id) {
            <li><span>{{ i.name }}</span><span>{{ qty(i.qty) }} {{ unit(i.unit) }} × {{ i.price_snapshot | sum }}</span></li>
          } @empty { <li class="muted">Mahsulotlar ro'yxati yo'q</li> }
        </ul>
      }
    </article>
  `,
  styles: [`
    .card { background: #fff; border: 1px solid #eee; border-radius: 14px; margin: 0 1rem .75rem; overflow: hidden; }
    .head { width: 100%; text-align: left; border: none; background: none; padding: .85rem 1rem; cursor: pointer; font: inherit; }
    .top { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
    .status { font-size: .75rem; border-radius: 999px; padding: .2rem .6rem; background: #f3f3f3; color: #444; }
    .s-new, .s-accepted { background: #fff4ec; color: #a34700; }
    .s-delivering { background: #e8f1ff; color: #1d4ed8; }
    .s-done { background: #e8f7ee; color: #1a7f4b; }
    .s-canceled { background: #fff1f0; color: #b42318; }
    .when { color: #6b6b6b; font-size: .9rem; margin-top: .25rem; }
    .progress { height: 4px; border-radius: 2px; background: #f0f0f0; margin-top: .4rem; overflow: hidden; }
    .progress span { display: block; height: 100%; background: #F60; }
    .total { font-weight: 800; margin-top: .25rem; }
    .items { list-style: none; margin: 0; padding: .25rem 1rem .85rem; border-top: 1px solid #f0f0f0; }
    .items li { display: flex; justify-content: space-between; gap: 1rem; padding: .35rem 0; font-size: .9rem; }
    .muted { color: #767676; }
  `],
})
export class OrderCard {
  order = input.required<Order>();
  /** Device-only history entry: its status is whatever the server said at creation and never updates. */
  local = input(false);
  open = signal(false);

  statusLabel = computed(() => (this.local() ? 'Yuborilgan' : stageLabel(this.order())));
  progress = computed(() => {
    const o = this.order();
    if (this.local() || o.is_final || o.is_canceled) return null;
    const step = o.status_step ?? 0;
    const total = o.status_total ?? 0;
    return total > 0 && step > 0 ? Math.round((step / total) * 100) : null;
  });
  when = computed(() => {
    const o = this.order();
    const day = o.delivery_date ? formatDayMonth(o.delivery_date) : "sana ko'rsatilmagan";
    const window = o.delivery_start && o.delivery_end ? `, ${o.delivery_start} – ${o.delivery_end}` : '';
    return day + window;
  });

  qty(q: string): number { return Number(q); }
  unit(u: string): string { return unitLabel(u); }
}

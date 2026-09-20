import { Component, computed, input } from '@angular/core';
import { OperatorOrder } from '../../core/api/models/operator.models';
import { SumPipe } from '../../shared/pipes/sum.pipe';
import { unitLabel } from '../../shared/utils/units';

/** Paper receipt. Hidden on screen; the global @media print rule reveals just this block. */
@Component({
  selector: 'tx-order-receipt',
  standalone: true,
  imports: [SumPipe],
  template: `
    @if (order(); as o) {
      <div class="receipt">
        <div class="head">
          <b>TEZXARID</b>
          <div>{{ cityName() }}</div>
        </div>
        <div class="line"></div>
        <div class="row"><span>Buyurtma</span><b>№ {{ o.id }}</b></div>
        <div class="row"><span>Qabul</span><span>{{ acceptedAt() }}</span></div>
        <div class="row"><span>Yetkazish</span><span>{{ deliveryAt() }}</span></div>
        <div class="line"></div>
        @for (i of o.items; track i.id) {
          <div class="item">
            <div class="n">{{ i.name }}</div>
            <div class="q"><span>{{ qty(i.qty) }} {{ unit(i.unit) }}</span><span>{{ i.line_total | sum }}</span></div>
          </div>
        }
        <div class="line"></div>
        <div class="row total"><span>JAMI</span><b>{{ o.total | sum }}</b></div>
        <div class="row"><span>To'lov</span><span>{{ o.payment_type === 'cash' ? 'Naqd' : 'Online' }}</span></div>
        <div class="line"></div>
        <div class="who">
          <div><b>{{ o.customer_name }}</b></div>
          <div>{{ o.phone }}</div>
          <div>{{ o.address }}</div>
          @if (o.comment) { <div>Izoh: {{ o.comment }}</div> }
        </div>
        <div class="line"></div>
        <div class="foot">Rahmat! Yana kutamiz</div>
      </div>
    }
  `,
  styles: [`
    :host { display: none; }
    .receipt { width: 72mm; font-family: 'Courier New', monospace; font-size: 12px; color: #000; }
    .head { text-align: center; margin-bottom: .5rem; }
    .head b { font-size: 16px; letter-spacing: .1em; }
    .line { border-top: 1px dashed #000; margin: .35rem 0; }
    .row { display: flex; justify-content: space-between; gap: .5rem; }
    .row.total b { font-size: 14px; }
    .item { margin: .15rem 0; }
    .item .q { display: flex; justify-content: space-between; }
    .who div { word-break: break-word; }
    .foot { text-align: center; margin-top: .4rem; }
  `],
})
export class OrderReceipt {
  order = input.required<OperatorOrder | null>();
  cityName = input('');

  acceptedAt = computed(() => this.stamp(this.order()?.created_at ?? ''));
  deliveryAt = computed(() => {
    const o = this.order();
    if (!o?.delivery_date) return "sana ko'rsatilmagan";
    const [y, m, d] = o.delivery_date.split('-');
    const window = o.delivery_start && o.delivery_end ? ` ${o.delivery_start} – ${o.delivery_end}` : '';
    return `${d}.${m}.${y}${window}`;
  });

  qty(value: string): number { return Number(value); }
  unit(value: string): string { return unitLabel(value); }

  private stamp(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

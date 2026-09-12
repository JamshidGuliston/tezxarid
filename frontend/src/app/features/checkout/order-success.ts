import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { OrderStore } from '../../core/orders/order.store';
import { SumPipe } from '../../shared/pipes/sum.pipe';
import { formatDayMonth } from '../../shared/utils/dates';

@Component({
  selector: 'tx-order-success',
  standalone: true,
  imports: [RouterLink, SumPipe],
  template: `
    @if (order(); as o) {
      <div class="page">
        <div class="check" aria-hidden="true">✓</div>
        <h2>Buyurtma qabul qilindi</h2>
        <p class="num">№ {{ o.id }}</p>
        <dl class="facts">
          <div><dt>Yetkazish</dt><dd>{{ dateLabel() }}, {{ o.delivery_start }} – {{ o.delivery_end }}</dd></div>
          <div><dt>Manzil</dt><dd>{{ o.address }}</dd></div>
          <div><dt>To'lov</dt><dd>Naqd pul</dd></div>
          <div><dt>Jami</dt><dd class="grand">{{ o.total | sum }}</dd></div>
        </dl>
        <p class="muted">Kuryer yetkazishdan oldin siz bilan bog'lanadi.</p>
        <a class="home" routerLink="/">Bosh sahifaga</a>
      </div>
    }
  `,
  styles: [`
    .page { max-width: 480px; margin: 0 auto; padding: 2rem 1rem; text-align: center; }
    .check { width: 4rem; height: 4rem; margin: 0 auto 1rem; border-radius: 50%; background: #e8f7ee;
      color: #1a7f4b; font-size: 2rem; display: grid; place-items: center; }
    h2 { margin: 0 0 .25rem; }
    .num { color: #6b6b6b; margin: 0 0 1.25rem; }
    .facts { text-align: left; background: #f3f3f3; border-radius: 14px; padding: .5rem 1rem; margin: 0 0 1rem; }
    .facts div { display: flex; justify-content: space-between; gap: 1rem; padding: .5rem 0; border-bottom: 1px solid #e6e6e6; }
    .facts div:last-child { border-bottom: none; }
    dt { color: #6b6b6b; } dd { margin: 0; text-align: right; }
    .grand { font-weight: 800; }
    .muted { color: #6b6b6b; font-size: .9rem; }
    .home { display: inline-block; margin-top: .5rem; background: #F60; color: #fff; text-decoration: none;
      border-radius: 14px; padding: .9rem 1.5rem; font-weight: 700; }
    .home:focus-visible { outline: 2px solid #F60; outline-offset: 2px; }
  `],
})
export class OrderSuccess {
  private router = inject(Router);
  order = inject(OrderStore).lastOrder;
  dateLabel = computed(() => {
    const o = this.order();
    return o ? formatDayMonth(o.delivery_date) : '';
  });

  constructor() {
    // Hard refresh (or a direct visit) loses the in-memory order — nothing to show, go home.
    if (!this.order()) void this.router.navigateByUrl('/');
  }
}

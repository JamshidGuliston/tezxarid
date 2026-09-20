import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OperatorApi } from '../../core/api/operator-api';
import { OperatorCustomer } from '../../core/api/models/operator.models';
import { SumPipe } from '../../shared/pipes/sum.pipe';

/** One customer: profile, saved addresses and every order they placed in this city. */
@Component({
  selector: 'tx-customer-detail',
  standalone: true,
  imports: [RouterLink, SumPipe, DatePipe],
  template: `
    @if (customer(); as c) {
      <div class="page">
        <div class="top">
          <a routerLink="/order-admin/customers" class="back">← Mijozlar</a>
          <h1>{{ c.name }}</h1>
        </div>

        <section class="card">
          <div class="facts">
            <div><span>Telefon</span><b>{{ c.phone || '—' }}</b></div>
            <div><span>Telegram</span><b>{{ c.telegram_id ?? '—' }}</b></div>
            <div><span>Ro'yxatdan</span><b>{{ c.date_joined | date: 'dd.MM.yyyy' }}</b></div>
            <div><span>Buyurtmalar</span><b>{{ c.orders_count }}</b></div>
            <div><span>Jami xarid</span><b>{{ c.orders_total | sum }}</b></div>
          </div>
        </section>

        <section class="card">
          <h2>Manzillar</h2>
          <ul class="plain">
            @for (a of c.addresses; track a.id) {
              <li><b>{{ a.title || 'Manzil' }}</b> {{ a.address }} @if (a.is_default) { <span class="tag">Asosiy</span> }</li>
            } @empty { <li class="muted">Saqlangan manzil yo'q</li> }
          </ul>
        </section>

        <section class="card">
          <h2>Buyurtmalar</h2>
          @for (o of c.orders; track o.id) {
            <div class="order">
              <button type="button" class="toggle" (click)="toggle(o.id)">
                <b>№ {{ o.id }}</b>
                <span>{{ o.delivery_date }} {{ o.delivery_window }}</span>
                <span class="stage">{{ o.stage_name }}</span>
                <span class="sum">{{ o.total | sum }}</span>
              </button>
              @if (open().has(o.id)) {
                <ul class="plain items">
                  @for (i of o.items; track i.id) {
                    <li><span>{{ i.name }}</span><span>{{ i.qty }} {{ i.unit }} × {{ i.price_snapshot | sum }}</span></li>
                  }
                </ul>
                <div class="meta">{{ o.address }} @if (o.comment) { · {{ o.comment }} }</div>
                <a class="open" [routerLink]="['/order-admin/orders', o.id]">Buyurtmani ochish →</a>
              }
            </div>
          } @empty { <p class="muted">Buyurtma yo'q</p> }
        </section>
      </div>
    } @else if (error()) {
      <p class="err" role="alert">Mijoz topilmadi.</p>
    }
  `,
  styles: [`
    .page { max-width: 48rem; margin: 0 auto; padding: 1rem; display: grid; gap: .75rem; }
    .top { display: flex; align-items: center; gap: 1rem; }
    .top h1 { margin: 0; font-size: 1.25rem; }
    .back { text-decoration: none; color: #444; }
    .card { background: #fff; border-radius: 14px; padding: 1rem; }
    .card h2 { margin: 0 0 .5rem; font-size: 1rem; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: .5rem; }
    .facts span { display: block; font-size: .72rem; text-transform: uppercase; color: #6b6b6b; }
    .plain { list-style: none; margin: 0; padding: 0; }
    .plain li { display: flex; justify-content: space-between; gap: 1rem; padding: .3rem 0; border-bottom: 1px solid #f2f2f2; }
    .tag { background: #fff4ec; color: #a34700; border-radius: 999px; padding: .1rem .5rem; font-size: .7rem; }
    .order { border-bottom: 1px solid #f2f2f2; padding: .25rem 0; }
    .toggle { display: grid; grid-template-columns: 5rem 1fr 8rem 7rem; gap: .5rem; width: 100%; text-align: left;
      border: none; background: none; font: inherit; padding: .5rem 0; cursor: pointer; align-items: center; }
    .toggle .sum { text-align: right; font-weight: 700; }
    .toggle .stage { color: #6b6b6b; }
    .items { margin: .25rem 0 .5rem; font-size: .9rem; }
    .meta { color: #6b6b6b; font-size: .85rem; }
    .open { color: #F60; font-weight: 700; text-decoration: none; font-size: .9rem; }
    .muted { color: #767676; }
    .err { background: #fff1f0; color: #b42318; border-radius: 10px; padding: .6rem .9rem; margin: 1rem; }
    @media (max-width: 640px) { .toggle { grid-template-columns: 4rem 1fr auto; } .toggle .stage { display: none; } }
  `],
})
export class CustomerDetail {
  private api = inject(OperatorApi);
  private route = inject(ActivatedRoute);

  customer = signal<OperatorCustomer | null>(null);
  error = signal(false);
  open = signal(new Set<number>());

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.customer(id).subscribe({
      next: (c) => this.customer.set(c),
      error: () => this.error.set(true),
    });
  }

  toggle(orderId: number): void {
    this.open.update((set) => {
      const next = new Set(set);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      return next;
    });
  }
}

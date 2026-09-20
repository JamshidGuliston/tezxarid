import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, of, startWith, switchMap } from 'rxjs';
import { OperatorApi } from '../../core/api/operator-api';
import { OperatorCustomerRow } from '../../core/api/models/operator.models';
import { SumPipe } from '../../shared/pipes/sum.pipe';

/** Everyone who has ordered in this city, or whose profile city is this one. */
@Component({
  selector: 'tx-customers',
  standalone: true,
  imports: [RouterLink, SumPipe, DatePipe],
  template: `
    <div class="page">
      <input #q type="search" placeholder="Ism yoki telefon" aria-label="Mijoz qidirish"
        [value]="query()" (input)="query.set(q.value)" />
      <div class="rows">
        @for (c of rows(); track c.id) {
          <a class="row" [routerLink]="['/order-admin/customers', c.id]">
            <div class="who"><b>{{ c.name }}</b><small>{{ c.phone || '—' }}</small></div>
            <div class="n">{{ c.orders_count }}<small>buyurtma</small></div>
            <div class="sum">{{ c.orders_total | sum }}</div>
            <div class="last">{{ c.last_order_at ? (c.last_order_at | date: 'dd.MM.yyyy') : '—' }}</div>
          </a>
        } @empty { <p class="empty">Mijoz topilmadi</p> }
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 60rem; margin: 0 auto; padding: 1rem; }
    input { width: 100%; border: none; border-radius: 12px; background: #fff; padding: .7rem .9rem; font: inherit; margin-bottom: .75rem; }
    .rows { display: grid; gap: .5rem; }
    .row { display: grid; grid-template-columns: 1fr 6rem 9rem 7rem; gap: .75rem; align-items: center;
      background: #fff; border-radius: 12px; padding: .75rem 1rem; text-decoration: none; color: #1a1a1a; }
    .row small { display: block; color: #6b6b6b; font-size: .78rem; }
    .sum { font-weight: 700; text-align: right; }
    .last { text-align: right; color: #6b6b6b; }
    .empty { text-align: center; color: #767676; padding: 2rem; }
    @media (max-width: 720px) { .row { grid-template-columns: 1fr auto; } .n, .last { display: none; } }
  `],
})
export class Customers {
  private api = inject(OperatorApi);
  query = signal('');
  rows = signal<OperatorCustomerRow[]>([]);

  constructor() {
    toObservable(this.query).pipe(
      debounceTime(300),
      distinctUntilChanged(),
      startWith(''),
      switchMap((q) => this.api.customers(q.trim()).pipe(catchError(() => of({ count: 0, results: [] })))),
      takeUntilDestroyed(),
    ).subscribe((page) => this.rows.set(page.results));
  }
}

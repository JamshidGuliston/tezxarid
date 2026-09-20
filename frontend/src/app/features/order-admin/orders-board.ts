import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, combineLatest, interval, map, startWith, switchMap } from 'rxjs';
import { OperatorApi } from '../../core/api/operator-api';
import { OperatorOrderRow, OperatorStage } from '../../core/api/models/operator.models';
import { SumPipe } from '../../shared/pipes/sum.pipe';
import { beep } from '../../shared/utils/beep';

const POLL_MS = 15_000;

/** The operator's working list: stage tabs, search, date filter and a self-refreshing table. */
@Component({
  selector: 'tx-orders-board',
  standalone: true,
  imports: [RouterLink, SumPipe, DatePipe],
  template: `
    <div class="page">
      <div class="tabs">
        <button type="button" [class.on]="stage() === ''" (click)="stage.set('')">Hammasi</button>
        @for (s of stages(); track s.id) {
          <button type="button" [class.on]="stage() === s.code" (click)="stage.set(s.code)">
            {{ s.name }} <span class="n">{{ counts()[s.code] ?? 0 }}</span>
          </button>
        }
      </div>

      <div class="filters">
        <input #q type="search" placeholder="Raqam, ism yoki telefon" aria-label="Qidiruv"
          [value]="query()" (input)="query.set(q.value)" />
        <input #d type="date" aria-label="Yetkazish sanasi" [value]="date()" (change)="date.set(d.value)" />
        <button type="button" class="ghost" (click)="refresh()">Yangilash</button>
      </div>

      @if (stale()) { <p class="stale" role="status">Ro'yxat yangilanmadi, qayta urinilmoqda…</p> }

      <div class="rows">
        @for (o of orders(); track o.id) {
          <a class="row" [routerLink]="['/order-admin/orders', o.id]">
            <div class="id">№ {{ o.id }}<small>{{ o.created_at | date: 'HH:mm' }}</small></div>
            <div class="who"><b>{{ o.customer_name }}</b><small>{{ o.phone }}</small></div>
            <div class="when">{{ o.delivery_date }}<small>{{ o.delivery_window }}</small></div>
            <div class="sum">{{ o.total | sum }}<small>{{ o.items_count }} ta</small></div>
            <div class="stage">{{ o.stage_name }}</div>
          </a>
        } @empty {
          <p class="empty">Buyurtma topilmadi</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 60rem; margin: 0 auto; padding: 1rem; }
    .tabs { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: .75rem; }
    .tabs button { border: none; background: #fff; border-radius: 999px; padding: .45rem .9rem; font: inherit;
      font-size: .9rem; cursor: pointer; }
    .tabs button.on { background: #F60; color: #fff; font-weight: 700; }
    .n { opacity: .75; font-size: .8em; margin-left: .25rem; }
    .filters { display: flex; gap: .5rem; margin-bottom: .75rem; flex-wrap: wrap; }
    .filters input { border: none; border-radius: 12px; padding: .6rem .8rem; font: inherit; background: #fff; flex: 1 1 10rem; }
    .ghost { border: 1px solid #d5d5d5; background: #fff; border-radius: 12px; padding: .6rem 1rem; font: inherit; cursor: pointer; }
    .stale { color: #7a4b00; background: #fff8e6; border-radius: 10px; padding: .5rem .75rem; margin: 0 0 .5rem; }
    .rows { display: grid; gap: .5rem; }
    .row { display: grid; grid-template-columns: 6rem 1fr 8rem 8rem 8rem; gap: .75rem; align-items: center;
      background: #fff; border-radius: 12px; padding: .75rem 1rem; text-decoration: none; color: #1a1a1a; }
    .row small { display: block; color: #6b6b6b; font-size: .78rem; }
    .sum { font-weight: 700; text-align: right; }
    .stage { text-align: right; color: #444; font-size: .9rem; }
    .empty { text-align: center; color: #767676; padding: 2rem; }
    @media (max-width: 720px) { .row { grid-template-columns: 5rem 1fr auto; } .when, .stage { display: none; } }
  `],
})
export class OrdersBoard {
  private api = inject(OperatorApi);

  stages = signal<OperatorStage[]>([]);
  orders = signal<OperatorOrderRow[]>([]);
  counts = signal<Record<string, number>>({});
  stale = signal(false);
  stage = signal('');
  query = signal('');
  date = signal('');
  private tick = signal(0);
  private highestSeen = -1;

  private filters = computed(() => ({ stage: this.stage(), q: this.query().trim(), date: this.date(), tick: this.tick() }));

  constructor() {
    this.api.stages().pipe(takeUntilDestroyed()).subscribe({
      next: (list) => {
        this.stages.set(list);
        const initial = list.find((s) => s.is_initial);
        if (initial) this.stage.set(initial.code);
      },
      error: () => this.stages.set([]),
    });

    combineLatest([
      toObservable(this.filters),
      interval(POLL_MS).pipe(startWith(0)),
    ]).pipe(
      map(([filters]) => filters),
      switchMap((f) => this.api.orders({ stage: f.stage, q: f.q, date: f.date }).pipe(
        map((page) => ({ ok: true as const, page })),
        catchError(() => [{ ok: false as const, page: null }]),
      )),
      takeUntilDestroyed(),
    ).subscribe((result) => {
      if (!result.ok || !result.page) { this.stale.set(true); return; }
      this.stale.set(false);
      this.counts.set(result.page.counts);
      const rows = result.page.results;
      const highest = rows.reduce((max, row) => Math.max(max, row.id), -1);
      if (this.highestSeen >= 0 && highest > this.highestSeen) this.alert();
      this.highestSeen = Math.max(this.highestSeen, highest);
      this.orders.set(rows);
    });
  }

  /** Overridable in tests; plays a tone and flags the tab title. */
  alert(): void {
    beep();
    try { document.title = `(!) Yangi buyurtma · Tezxarid`; } catch { /* ignore */ }
  }

  refresh(): void {
    this.tick.update((n) => n + 1);
  }
}

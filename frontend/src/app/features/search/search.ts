import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { CatalogApi } from '../../core/api/catalog-api';
import { Product } from '../../core/api/models/catalog.models';
import { ProductGrid } from '../../shared/ui/product-grid/product-grid';

type SearchState = 'idle' | 'loading' | 'ready' | 'error';
const MIN_CHARS = 2;

@Component({
  selector: 'tx-search',
  standalone: true,
  imports: [ProductGrid],
  template: `
    <div class="page">
      <div class="bar">
        <input #box type="search" placeholder="Do'konda qidirish" aria-label="Qidiruv" autofocus
          [value]="query()" (input)="query.set(box.value)" />
        @if (query()) {
          <button type="button" class="clear" aria-label="Tozalash" (click)="query.set(''); box.focus()">✕</button>
        }
      </div>
      @switch (state()) {
        @case ('idle') { <p class="hint">Kamida 2 ta harf kiriting</p> }
        @case ('loading') { <p class="hint">Qidirilmoqda…</p> }
        @case ('error') {
          <p class="hint" role="status">Qidiruvda xatolik.
            <button type="button" class="link" (click)="retry()">Qayta urinish</button>
          </p>
        }
        @case ('ready') { <tx-product-grid [products]="results()" emptyText="Hech narsa topilmadi" /> }
      }
    </div>
  `,
  styles: [`
    .bar { position: relative; padding: 1rem 1rem 0; }
    input { width: 100%; border: none; border-radius: 999px; background: #f3f3f3; padding: .85rem 2.75rem .85rem 1.1rem;
      font: inherit; outline: none; }
    input:focus-visible { outline: 2px solid #F60; outline-offset: 2px; }
    .clear { position: absolute; right: 1.6rem; top: 1.45rem; border: none; background: none; color: #6b6b6b;
      cursor: pointer; font-size: 1rem; }
    .hint { color: #767676; text-align: center; padding: 2rem 1rem; }
    .link { border: none; background: none; color: #F60; font-weight: 700; cursor: pointer; font: inherit; }
  `],
})
export class Search {
  private api = inject(CatalogApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  query = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  results = signal<Product[]>([]);
  state = signal<SearchState>('idle');
  private retryTick = signal(0);
  private term = computed(() => ({ q: this.query().trim(), tick: this.retryTick() }));

  constructor() {
    toObservable(this.term).pipe(
      debounceTime(300),
      distinctUntilChanged((a, b) => a.q === b.q && a.tick === b.tick),
      tap(({ q }) => {
        void this.router.navigate([], { queryParams: { q: q || null }, replaceUrl: true });
        if (q.length < MIN_CHARS) { this.results.set([]); this.state.set('idle'); }
        else this.state.set('loading');
      }),
      switchMap(({ q }) => q.length < MIN_CHARS ? EMPTY : this.api.getProducts(undefined, q).pipe(
        map((list) => ({ ok: true as const, list })),
        catchError(() => of({ ok: false as const, list: [] as Product[] })),
      )),
      takeUntilDestroyed(),
    ).subscribe((r) => {
      if (r.ok) { this.results.set(r.list); this.state.set('ready'); } else this.state.set('error');
    });
  }

  retry(): void {
    this.retryTick.update((n) => n + 1);
  }
}

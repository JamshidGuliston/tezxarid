import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { CatalogApi } from '../../core/api/catalog-api';
import { Category } from '../../core/api/models/catalog.models';
import { CityService } from '../../core/city/city.service';
import { AppHeader } from '../../shared/ui/app-header/app-header';
import { BackButton } from '../../shared/ui/back-button/back-button';
import { BottomNav } from '../../shared/ui/bottom-nav/bottom-nav';
import { CartPanel } from '../../shared/ui/cart-panel/cart-panel';
import { FloatingCart } from '../../shared/ui/floating-cart/floating-cart';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AppHeader, BackButton, BottomNav, CartPanel, FloatingCart],
  template: `
    <tx-app-header />
    <div class="body">
      <aside class="sidebar">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Bosh sahifa</a>
        @for (c of categories(); track c.id) {
          <a [routerLink]="['/category', c.id]" routerLinkActive="active">{{ c.name }}</a>
        }
      </aside>
      <main class="main"><router-outlet /></main>
      <aside class="cart"><tx-cart-panel /></aside>
    </div>
    <tx-back-button />
    <tx-floating-cart />
    <tx-bottom-nav />
  `,
  styleUrl: './shell.scss',
})
export class Shell {
  private api = inject(CatalogApi);
  private city = inject(CityService);
  categories = signal<Category[]>([]);

  constructor() {
    // app.config.ts has already attempted city resolution. Reload the sidebar whenever the
    // active city changes (Profile lets the user switch it); a failed load renders empty.
    toObservable(this.city.activeCity)
      .pipe(
        switchMap(() => this.api.getCategories().pipe(catchError((err) => { console.error('Categories failed', err); return of([] as Category[]); }))),
        takeUntilDestroyed(),
      )
      .subscribe((list) => this.categories.set(list));
  }
}

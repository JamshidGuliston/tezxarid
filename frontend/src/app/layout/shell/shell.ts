import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CatalogApi } from '../../core/api/catalog-api';
import { Category } from '../../core/api/models/catalog.models';
import { CityService } from '../../core/city/city.service';
import { AppHeader } from '../../shared/ui/app-header/app-header';
import { BottomNav } from '../../shared/ui/bottom-nav/bottom-nav';
import { CartPanel } from '../../shared/ui/cart-panel/cart-panel';
import { FloatingCart } from '../../shared/ui/floating-cart/floating-cart';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AppHeader, BottomNav, CartPanel, FloatingCart],
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
    this.city.init().then(() => {
      this.api.getCategories().subscribe((list) => this.categories.set(list));
    });
  }
}

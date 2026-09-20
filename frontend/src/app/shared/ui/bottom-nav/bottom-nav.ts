import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavItem { path: string; label: string; icon: string; }

// 24×24 stroke icons (currentColor).
const ITEMS: readonly NavItem[] = [
  { path: '/', label: 'Bosh sahifa', icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { path: '/search', label: 'Qidiruv', icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3' },
  { path: '/orders', label: 'Buyurtmalar', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 2' },
  { path: '/profile', label: 'Profil', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0' },
];

@Component({
  selector: 'tx-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="nav" aria-label="Asosiy bo'limlar">
      @for (item of items; track item.path) {
        <a [routerLink]="item.path" routerLinkActive="active" ariaCurrentWhenActive="page"
           [routerLinkActiveOptions]="{ exact: item.path === '/' }">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path [attr.d]="item.icon" />
          </svg>
          <span>{{ item.label }}</span>
        </a>
      }
    </nav>
  `,
  styles: [`
    .nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; display: flex;
      height: var(--tx-nav-h);
      padding-bottom: env(safe-area-inset-bottom, 0px);
      border-top: 1px solid #eee; background: #fff; }
    .nav a { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: .2rem; color: #595959; text-decoration: none; font-size: .7rem; white-space: nowrap; }
    .nav a svg { width: 24px; height: 24px; }
    .nav a.active { color: #F60; font-weight: 600; }
    .nav a:focus-visible { outline: 2px solid #F60; outline-offset: -2px; }
  `],
})
export class BottomNav {
  readonly items: readonly NavItem[] = ITEMS;
}

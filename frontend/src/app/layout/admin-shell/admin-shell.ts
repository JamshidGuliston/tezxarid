import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { OperatorStore } from '../../core/operator/operator.store';

/** Chrome for the operator console: no customer nav, no cart, no back button. */
@Component({
  selector: 'tx-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="bar">
      <div class="who">
        <b>{{ store.operator()?.city_name || 'Operator' }}</b>
        <small>{{ store.operator()?.first_name || store.operator()?.username }}</small>
      </div>
      <nav>
        <a routerLink="/order-admin" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">Buyurtmalar</a>
        <a routerLink="/order-admin/customers" routerLinkActive="on">Mijozlar</a>
      </nav>
      <button type="button" class="out" (click)="signOut()">Chiqish</button>
    </header>
    <main><router-outlet /></main>
  `,
  styles: [`
    :host { display: block; background: #f5f5f5; min-height: 100vh; }
    .bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 1rem;
      background: #1f2430; color: #fff; padding: .6rem 1rem; }
    .who { display: grid; line-height: 1.2; }
    .who small { color: #b9c0cc; font-size: .75rem; }
    nav { display: flex; gap: .25rem; margin-left: auto; }
    nav a { color: #d7dbe3; text-decoration: none; padding: .4rem .8rem; border-radius: 999px; font-size: .9rem; }
    nav a.on { background: #F60; color: #fff; font-weight: 700; }
    .out { border: none; background: #2c3342; color: #d7dbe3; border-radius: 999px; padding: .4rem .9rem;
      font: inherit; font-size: .85rem; cursor: pointer; }
    main { padding-bottom: 2rem; }
    @media print { .bar { display: none; } }
  `],
})
export class AdminShell {
  store = inject(OperatorStore);
  private router = inject(Router);

  signOut(): void {
    this.store.signOut();
    void this.router.navigateByUrl('/order-admin/login');
  }
}

import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'tx-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="nav">
      <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Bosh sahifa</a>
      <!-- Search / orders / profile ship in Plans 3c–3d; shown disabled until then. -->
      <span class="soon" aria-disabled="true" title="Tez orada">Qidiruv</span>
      <span class="soon" aria-disabled="true" title="Tez orada">Buyurtmalar</span>
      <span class="soon" aria-disabled="true" title="Tez orada">Profil</span>
    </nav>
  `,
  styles: [`
    .nav { display: flex; justify-content: space-around; border-top: 1px solid #eee;
      background: #fff; padding: .4rem 0; }
    .nav a, .nav .soon { color: #9a9a9a; text-decoration: none; font-size: .8rem; }
    .nav a.active { color: #F60; font-weight: 600; }
    .nav .soon { opacity: .45; cursor: default; user-select: none; }
  `],
})
export class BottomNav {}

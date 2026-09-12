import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'tx-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="nav">
      <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Bosh sahifa</a>
      <!-- Search / orders / profile ship in Plans 3c–3d; disabled until then. -->
      <button type="button" class="soon" disabled>Qidiruv</button>
      <button type="button" class="soon" disabled>Buyurtmalar</button>
      <button type="button" class="soon" disabled>Profil</button>
    </nav>
  `,
  styles: [`
    .nav { display: flex; justify-content: space-around; border-top: 1px solid #eee; background: #fff; padding: .4rem 0; }
    .nav a, .nav .soon { color: #595959; text-decoration: none; font-size: .8rem; background: none; border: none; font: inherit; font-size: .8rem; }
    .nav a.active { color: #F60; font-weight: 600; }
    .nav .soon { color: #767676; cursor: default; }
  `],
})
export class BottomNav {}

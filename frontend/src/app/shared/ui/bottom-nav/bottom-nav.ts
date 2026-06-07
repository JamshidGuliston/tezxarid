import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'tx-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="nav">
      <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Bosh sahifa</a>
      <a routerLink="/search" routerLinkActive="active">Qidiruv</a>
      <a routerLink="/orders" routerLinkActive="active">Buyurtmalar</a>
      <a routerLink="/profile" routerLinkActive="active">Profil</a>
    </nav>
  `,
  styles: [`
    .nav { display: flex; justify-content: space-around; border-top: 1px solid #eee;
      background: #fff; padding: .4rem 0; }
    .nav a { color: #9a9a9a; text-decoration: none; font-size: .8rem; }
    .nav a.active { color: #F60; font-weight: 600; }
  `],
})
export class BottomNav {}

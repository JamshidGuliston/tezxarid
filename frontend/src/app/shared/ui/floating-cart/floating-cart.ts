import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartStore } from '../../../core/cart/cart.store';
import { SumPipe } from '../../pipes/sum.pipe';

@Component({
  selector: 'tx-floating-cart',
  standalone: true,
  imports: [RouterLink, SumPipe],
  template: `
    @if (cart.count() > 0) {
      <a class="pill" routerLink="/cart">
        <span class="badge">{{ cart.count() }}</span>
        <span class="total">{{ cart.total() | sum }}</span>
      </a>
    }
  `,
  styles: [`
    .pill { position: fixed; right: 1rem; bottom: 4.5rem; z-index: 20;
      display: inline-flex; align-items: center; gap: .6rem; background: #F60; color: #fff;
      padding: .7rem 1.2rem; border-radius: 999px; text-decoration: none; font-weight: 700;
      box-shadow: 0 4px 12px rgba(0,0,0,.25); }
    .badge { background: rgba(255,255,255,.3); border-radius: 50%; width: 1.5rem; height: 1.5rem;
      display: grid; place-items: center; font-size: .85rem; }
  `],
})
export class FloatingCart {
  cart = inject(CartStore);
}

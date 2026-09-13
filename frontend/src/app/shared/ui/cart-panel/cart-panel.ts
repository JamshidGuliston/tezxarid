import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartStore } from '../../../core/cart/cart.store';
import { SumPipe } from '../../pipes/sum.pipe';
import { QtyStepper } from '../qty-stepper/qty-stepper';

@Component({
  selector: 'tx-cart-panel',
  standalone: true,
  imports: [RouterLink, SumPipe, QtyStepper],
  template: `
    <section class="panel">
      <header class="head">
        <span>Savat <small>{{ cart.count() }} ta mahsulot</small></span>
        @if (cart.count() > 0) {
          <button type="button" class="clear" (click)="cart.clear()">Tozalash</button>
        }
      </header>
      @if (cart.count() === 0) {
        <p class="empty">Savat bo'sh</p>
      } @else {
        <ul class="list">
          @for (item of cart.items(); track item.cityProductId) {
            <li class="row">
              <div class="thumb" [style.backgroundImage]="item.image ? 'url(' + item.image + ')' : 'none'"></div>
              <div class="info">
                <div class="name">{{ item.name }}</div>
                <div class="price">{{ item.price | sum }}</div>
              </div>
              <tx-qty-stepper [qty]="item.qty" [unit]="item.unit"
                (inc)="cart.increment(item.cityProductId)"
                (dec)="cart.decrement(item.cityProductId)" />
              <button type="button" class="remove" aria-label="o'chirish"
                (click)="cart.remove(item.cityProductId)">✕</button>
            </li>
          }
        </ul>
        <footer class="foot">
          <div><small>Jami</small><div class="grand">{{ cart.total() | sum }}</div></div>
          <a class="order" routerLink="/checkout">Buyurtma berish →</a>
        </footer>
      }
    </section>
  `,
  styles: [`
    .panel { display: flex; flex-direction: column; height: 100%; }
    .head { display: flex; align-items: center; justify-content: space-between;
      background: #F60; color: #fff; padding: .75rem 1rem; font-weight: 700; }
    .head small { font-weight: 400; opacity: .9; margin-left: .4rem; }
    .clear { background: rgba(0,0,0,.28); color: #fff; border: none; border-radius: 999px;
      padding: .3rem .8rem; font-size: .85rem; font-family: inherit; cursor: pointer; }
    .empty { padding: 2rem 1rem; color: #9a9a9a; text-align: center; }
    .list { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; }
    .row { display: flex; align-items: center; gap: .6rem; padding: .6rem 1rem; border-bottom: 1px solid #f0f0f0; }
    .thumb { flex: 0 0 48px; width: 48px; height: 48px; border-radius: 10px;
      background: #f3f3f3 center/cover no-repeat; }
    .info { flex: 1; min-width: 0; }
    .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .price { color: #555; font-size: .9rem; white-space: nowrap; }
    tx-qty-stepper { flex: 0 0 auto; }
    .remove { border: none; background: transparent; color: #6b6b6b; font-size: 1rem; cursor: pointer; padding: .25rem; }
    .foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem 1rem; padding: 1rem; }
    .grand { font-size: 1.3rem; font-weight: 800; white-space: nowrap; }
    .order { background: #18202b; color: #fff; text-decoration: none; border-radius: 12px;
      padding: .85rem 1.1rem; font-weight: 700; white-space: nowrap; }
  `],
})
export class CartPanel {
  cart = inject(CartStore);
}

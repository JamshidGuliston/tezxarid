import { Component, inject } from '@angular/core';
import { CartStore } from '../../../core/cart/cart.store';
import { SumPipe } from '../../pipes/sum.pipe';
import { QtyStepper } from '../qty-stepper/qty-stepper';

@Component({
  selector: 'tx-cart-panel',
  standalone: true,
  imports: [SumPipe, QtyStepper],
  template: `
    <section class="panel">
      <header class="head">Savat <small>{{ cart.count() }} ta mahsulot</small></header>
      @if (cart.count() === 0) {
        <p class="empty">Savat bo'sh</p>
      } @else {
        <ul class="list">
          @for (item of cart.items(); track item.cityProductId) {
            <li class="row">
              <div class="info">
                <div class="name">{{ item.name }}</div>
                <div class="price">{{ item.price | sum }}</div>
              </div>
              <tx-qty-stepper [qty]="item.qty" [unit]="item.unit"
                (inc)="cart.increment(item.cityProductId)"
                (dec)="cart.decrement(item.cityProductId)" />
            </li>
          }
        </ul>
        <footer class="foot">
          <div><small>Mahsulotlar</small><div class="grand">{{ cart.total() | sum }}</div></div>
          <button type="button" class="order">Buyurtma berish →</button>
        </footer>
      }
    </section>
  `,
  styles: [`
    .panel { display: flex; flex-direction: column; height: 100%; }
    .head { background: #F60; color: #fff; padding: .75rem 1rem; font-weight: 700; }
    .head small { font-weight: 400; opacity: .9; margin-left: .4rem; }
    .empty { padding: 2rem 1rem; color: #9a9a9a; text-align: center; }
    .list { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; }
    .row { display: flex; align-items: center; justify-content: space-between;
      gap: .75rem; padding: .75rem 1rem; border-bottom: 1px solid #f0f0f0; }
    .name { font-weight: 600; } .price { color: #555; }
    .foot { display: flex; align-items: center; justify-content: space-between; padding: 1rem; }
    .grand { font-size: 1.4rem; font-weight: 800; }
    .order { background: #18202b; color: #fff; border: none; border-radius: 12px;
      padding: .9rem 1.3rem; font-weight: 700; cursor: pointer; }
  `],
})
export class CartPanel {
  cart = inject(CartStore);
}

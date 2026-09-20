import { Component, inject, input } from '@angular/core';
import { Product } from '../../../core/api/models/catalog.models';
import { CartStore } from '../../../core/cart/cart.store';
import { ProductCard } from '../product-card/product-card';

/** Responsive grid of product cards wired to the cart (used by Category and Search). */
@Component({
  selector: 'tx-product-grid',
  standalone: true,
  imports: [ProductCard],
  template: `
    <div class="grid">
      @for (p of products(); track p.city_product_id) {
        <tx-product-card [product]="p" [qty]="cart.qtyOf(p.city_product_id)"
          (add)="cart.add(p)"
          (inc)="cart.increment(p.city_product_id)"
          (dec)="cart.decrement(p.city_product_id)" />
      } @empty {
        <p class="empty">{{ emptyText() }}</p>
      }
    </div>
  `,
  styles: [`
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; padding: 1rem; }
    .empty { color: #767676; padding: 2rem 0; grid-column: 1 / -1; text-align: center; }
  `],
})
export class ProductGrid {
  products = input.required<Product[]>();
  emptyText = input('Mahsulot topilmadi');
  cart = inject(CartStore);
}

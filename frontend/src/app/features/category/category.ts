import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CatalogApi } from '../../core/api/catalog-api';
import { Product } from '../../core/api/models/catalog.models';
import { CartStore } from '../../core/cart/cart.store';
import { ProductCard } from '../../shared/ui/product-card/product-card';

@Component({
  selector: 'tx-category',
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
        <p class="empty">Mahsulot topilmadi</p>
      }
    </div>
  `,
  styles: [`
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 1rem; padding: 1rem; }
    .empty { color: #9a9a9a; padding: 2rem; }
  `],
})
export class Category {
  private route = inject(ActivatedRoute);
  private api = inject(CatalogApi);
  cart = inject(CartStore);
  products = signal<Product[]>([]);

  constructor() {
    this.route.paramMap.subscribe((pm) => {
      const id = Number(pm.get('id'));
      this.api.getProducts(id).subscribe((list) => this.products.set(list));
    });
  }
}

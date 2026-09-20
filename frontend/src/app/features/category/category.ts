import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { switchMap } from 'rxjs';
import { CatalogApi } from '../../core/api/catalog-api';
import { Product } from '../../core/api/models/catalog.models';
import { ProductGrid } from '../../shared/ui/product-grid/product-grid';

@Component({
  selector: 'tx-category',
  standalone: true,
  imports: [ProductGrid],
  template: `<tx-product-grid [products]="products()" />`,
})
export class Category {
  private route = inject(ActivatedRoute);
  private api = inject(CatalogApi);
  products = signal<Product[]>([]);

  constructor() {
    // switchMap cancels a stale products request when the category id changes
    // (e.g. fast desktop-sidebar navigation); takeUntilDestroyed cleans up on destroy.
    this.route.paramMap
      .pipe(
        switchMap((pm) => this.api.getProducts(Number(pm.get('id')))),
        takeUntilDestroyed(),
      )
      .subscribe((list) => this.products.set(list));
  }
}

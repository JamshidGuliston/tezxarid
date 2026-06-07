import { Injectable, computed, signal } from '@angular/core';
import { Product } from '../api/models/catalog.models';

export interface CartItem {
  cityProductId: number;
  productId: number;
  name: string;
  unit: string;
  image: string;
  price: string;
  step: number;
  qty: number;
}

const STORAGE_KEY = 'tezxarid.cart';

@Injectable({ providedIn: 'root' })
export class CartStore {
  readonly items = signal<CartItem[]>(this.load());

  readonly count = computed(() => this.items().length);
  readonly total = computed(() =>
    this.items().reduce((sum, i) => sum + Number(i.price) * i.qty, 0),
  );

  add(product: Product): void {
    const step = Number(product.step) || 1;
    const existing = this.items().find((i) => i.cityProductId === product.city_product_id);
    if (existing) {
      this.setQty(product.city_product_id, this.round(existing.qty + step));
      return;
    }
    this.items.update((list) => [
      ...list,
      {
        cityProductId: product.city_product_id,
        productId: product.id,
        name: product.name,
        unit: product.unit,
        image: product.image,
        price: product.price,
        step,
        qty: step,
      },
    ]);
    this.persist();
  }

  setQty(cityProductId: number, qty: number): void {
    if (qty <= 0) {
      this.remove(cityProductId);
      return;
    }
    this.items.update((list) =>
      list.map((i) => (i.cityProductId === cityProductId ? { ...i, qty: this.round(qty) } : i)),
    );
    this.persist();
  }

  increment(cityProductId: number): void {
    const item = this.items().find((i) => i.cityProductId === cityProductId);
    if (item) this.setQty(cityProductId, item.qty + item.step);
  }

  decrement(cityProductId: number): void {
    const item = this.items().find((i) => i.cityProductId === cityProductId);
    if (item) this.setQty(cityProductId, item.qty - item.step);
  }

  remove(cityProductId: number): void {
    this.items.update((list) => list.filter((i) => i.cityProductId !== cityProductId));
    this.persist();
  }

  clear(): void {
    this.items.set([]);
    this.persist();
  }

  qtyOf(cityProductId: number): number {
    return this.items().find((i) => i.cityProductId === cityProductId)?.qty ?? 0;
  }

  private round(n: number): number {
    return Math.round(n * 1000) / 1000;
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items()));
  }

  private load(): CartItem[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as CartItem[];
    } catch {
      return [];
    }
  }
}

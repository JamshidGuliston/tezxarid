import { Injectable, signal } from '@angular/core';
import { Order } from '../api/models/order.models';

const STORAGE_KEY = 'tezxarid.orders';
const LIMIT = 20;

/** Orders placed from this device — the only history a guest has. Newest first. */
@Injectable({ providedIn: 'root' })
export class OrderHistoryStore {
  readonly orders = signal<Order[]>(this.load());

  add(order: Order): void {
    this.orders.update((list) => [order, ...list.filter((o) => o.id !== order.id)].slice(0, LIMIT));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.orders())); } catch { /* keep in memory */ }
  }

  private load(): Order[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
      return Array.isArray(parsed) ? (parsed as Order[]).slice(0, LIMIT) : [];
    } catch {
      return [];
    }
  }
}

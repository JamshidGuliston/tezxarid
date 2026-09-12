import { Injectable, signal } from '@angular/core';
import { Order } from '../api/models/order.models';

/** In-memory handoff from checkout to the success page (guests cannot re-fetch their order). */
@Injectable({ providedIn: 'root' })
export class OrderStore {
  readonly lastOrder = signal<Order | null>(null);
}

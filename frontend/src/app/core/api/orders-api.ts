import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DeliveryDay, Order, OrderCreatePayload } from './models/order.models';

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  getDeliverySlots(): Observable<DeliveryDay[]> {
    return this.http.get<DeliveryDay[]>(`${this.base}/delivery-slots/`);
  }

  createOrder(payload: OrderCreatePayload): Observable<Order> {
    return this.http.post<Order>(`${this.base}/orders/`, payload);
  }
}

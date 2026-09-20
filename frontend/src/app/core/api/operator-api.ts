import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  OperatorCustomer, OperatorCustomerRow, OperatorEvent, OperatorOrder, OperatorOrderPage,
  OperatorOrderPatch, OperatorProduct, OperatorSession, OperatorStage,
} from './models/operator.models';

export interface OrderQuery { stage?: string; q?: string; date?: string; limit?: number; offset?: number; }

@Injectable({ providedIn: 'root' })
export class OperatorApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;
  private ops = `${environment.apiUrl}/operator`;

  login(username: string, password: string): Observable<OperatorSession> {
    return this.http.post<OperatorSession>(`${this.base}/auth/login/`, { username, password });
  }

  stages(): Observable<OperatorStage[]> {
    return this.http.get<OperatorStage[]>(`${this.ops}/stages/`);
  }

  orders(query: OrderQuery = {}): Observable<OperatorOrderPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<OperatorOrderPage>(`${this.ops}/orders/`, { params });
  }

  order(id: number): Observable<OperatorOrder> {
    return this.http.get<OperatorOrder>(`${this.ops}/orders/${id}/`);
  }

  patchOrder(id: number, patch: OperatorOrderPatch): Observable<OperatorOrder> {
    return this.http.patch<OperatorOrder>(`${this.ops}/orders/${id}/`, patch);
  }

  replaceItems(id: number, items: { city_product: number; qty: string }[]): Observable<OperatorOrder> {
    return this.http.put<OperatorOrder>(`${this.ops}/orders/${id}/items/`, { items });
  }

  moveStage(id: number, stage: string, note = ''): Observable<OperatorOrder> {
    return this.http.post<OperatorOrder>(`${this.ops}/orders/${id}/stage/`, { stage, note });
  }

  logEvent(id: number, kind: 'called' | 'printed', note = ''): Observable<OperatorEvent> {
    return this.http.post<OperatorEvent>(`${this.ops}/orders/${id}/events/`, { kind, note });
  }

  products(search: string): Observable<OperatorProduct[]> {
    return this.http.get<OperatorProduct[]>(`${this.ops}/products/`, { params: new HttpParams().set('search', search) });
  }

  customers(q = ''): Observable<{ count: number; results: OperatorCustomerRow[] }> {
    return this.http.get<{ count: number; results: OperatorCustomerRow[] }>(
      `${this.ops}/customers/`, { params: new HttpParams().set('q', q) });
  }

  customer(id: number): Observable<OperatorCustomer> {
    return this.http.get<OperatorCustomer>(`${this.ops}/customers/${id}/`);
  }
}

import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { orderExistsGuard } from './order-exists.guard';
import { OrderStore } from '../orders/order.store';
import { Order } from '../api/models/order.models';

const ORDER: Order = {
  id: 12, city: 1, customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5',
  latitude: null, longitude: null, comment: '', status: 'new', payment_type: 'cash', total: '19300.00',
  delivery_date: '2026-09-13', delivery_start: '16:00', delivery_end: '19:00', created_at: '', items: [],
};

describe('orderExistsGuard', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([]), OrderStore] }));

  const run = () =>
    TestBed.runInInjectionContext(() =>
      orderExistsGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

  it('redirects home when no order was placed in this session', () => {
    const result = run() as UrlTree;
    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/');
  });

  it('allows the success page when an order exists', () => {
    TestBed.inject(OrderStore).lastOrder.set(ORDER);
    expect(run()).toBe(true);
  });
});

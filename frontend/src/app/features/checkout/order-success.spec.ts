import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { OrderSuccess } from './order-success';
import { OrderStore } from '../../core/orders/order.store';
import { Order } from '../../core/api/models/order.models';

const ORDER: Order = {
  id: 12, city: 1, customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5',
  latitude: null, longitude: null, comment: '', status: 'new', payment_type: 'cash', total: '19300.00',
  delivery_date: '2026-09-13', delivery_start: '16:00', delivery_end: '19:00', created_at: '', items: [],
};

describe('OrderSuccess', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [OrderSuccess], providers: [provideRouter([]), OrderStore],
  }));

  it('redirects home when there is no order to show', async () => {
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(OrderSuccess);
    await fixture.whenStable();
    expect(nav).toHaveBeenCalledWith('/');
  });

  it('shows the order number, delivery window, address and total', async () => {
    TestBed.inject(OrderStore).lastOrder.set(ORDER);
    const fixture = TestBed.createComponent(OrderSuccess);
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('№ 12');
    expect(text).toContain('13-sentabr');
    expect(text).toContain('16:00 – 19:00');
    expect(text).toContain('Chilonzor 5');
    expect(text).toContain("19 300 so'm");
    expect(fixture.nativeElement.querySelector('a.home').getAttribute('href')).toBe('/');
  });
});

import { TestBed } from '@angular/core/testing';
import { OrderCard } from './order-card';
import { Order } from '../../../core/api/models/order.models';

const ORDER: Order = {
  id: 12, city: 1, customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5',
  latitude: null, longitude: null, comment: '', status: 'delivering', payment_type: 'cash', total: '22150.00',
  delivery_date: '2026-09-13', delivery_start: '16:00', delivery_end: '19:00', created_at: '',
  items: [{ id: 1, name: 'Banan', unit: 'kg', qty: '0.500', price_snapshot: '24500.00' }],
};

describe('OrderCard', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [OrderCard] }));

  async function create(order: Order, local = false) {
    const fixture = TestBed.createComponent(OrderCard);
    fixture.componentRef.setInput('order', order);
    fixture.componentRef.setInput('local', local);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows number, delivery window, total and status, and expands the items', async () => {
    const fixture = await create(ORDER);
    const text = () => fixture.nativeElement.textContent as string;
    expect(text()).toContain('№ 12');
    expect(text()).toContain('13-sentabr, 16:00 – 19:00');
    expect(text()).toContain("22 150 so'm");
    expect(text()).toContain('Yetkazilmoqda');
    expect(fixture.nativeElement.querySelector('.items')).toBeNull();
    (fixture.nativeElement.querySelector('button.head') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text()).toContain('Banan');
    expect(text()).toContain('0.5 kg');
  });

  it('labels device-only orders as sent and survives null delivery fields', async () => {
    const fixture = await create({ ...ORDER, delivery_date: null, delivery_start: null, delivery_end: null }, true);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Yuborilgan');
    expect(text).toContain("sana ko'rsatilmagan");
  });
});

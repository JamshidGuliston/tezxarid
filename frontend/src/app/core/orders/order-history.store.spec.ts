import { OrderHistoryStore } from './order-history.store';
import { Order } from '../api/models/order.models';

const order = (id: number): Order => ({
  id, city: 1, customer_name: 'A', phone: '+998901234567', address: 'X', latitude: null, longitude: null,
  comment: '', status: 'new', payment_type: 'cash', total: '1000.00', delivery_date: '2026-09-20',
  delivery_start: '09:00', delivery_end: '12:00', created_at: '', items: [],
});

describe('OrderHistoryStore', () => {
  beforeEach(() => localStorage.clear());

  it('keeps newest first, de-duplicates by id and persists', () => {
    const store = new OrderHistoryStore();
    store.add(order(1));
    store.add(order(2));
    store.add(order(1));
    expect(store.orders().map((o) => o.id)).toEqual([1, 2]);
    expect(new OrderHistoryStore().orders().map((o) => o.id)).toEqual([1, 2]);
    expect(JSON.parse(localStorage.getItem('tezxarid.orders')!).length).toBe(2);
  });

  it('caps the list at 20', () => {
    const store = new OrderHistoryStore();
    for (let i = 1; i <= 25; i++) store.add(order(i));
    expect(store.orders().length).toBe(20);
    expect(store.orders()[0].id).toBe(25);
  });

  it('ignores corrupt storage', () => {
    localStorage.setItem('tezxarid.orders', '[nope');
    expect(new OrderHistoryStore().orders()).toEqual([]);
  });
});

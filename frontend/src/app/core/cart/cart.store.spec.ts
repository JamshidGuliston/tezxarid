import { TestBed } from '@angular/core/testing';
import { CartStore } from './cart.store';
import { Product } from '../api/models/catalog.models';

function product(over: Partial<Product> = {}): Product {
  return {
    id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
    step: '0.500', category: 1, price: '19300.00', is_available: true, stock: 0, ...over,
  };
}

describe('CartStore', () => {
  let cart: CartStore;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [CartStore] });
    cart = TestBed.inject(CartStore);
  });

  it('add inserts an item at its step quantity', () => {
    cart.add(product());
    expect(cart.count()).toBe(1);
    expect(cart.items()[0].qty).toBe(0.5);
  });

  it('add twice on the same product increments by step', () => {
    cart.add(product());
    cart.add(product());
    expect(cart.count()).toBe(1);
    expect(cart.items()[0].qty).toBe(1);
  });

  it('total sums price * qty', () => {
    cart.add(product({ city_product_id: 11, price: '19300.00', step: '1' }));
    cart.add(product({ city_product_id: 12, name: 'Non', price: '4300.00', step: '1' }));
    expect(cart.total()).toBe(23600);
  });

  it('setQty to 0 removes the line', () => {
    cart.add(product({ step: '1' }));
    cart.setQty(11, 0);
    expect(cart.count()).toBe(0);
  });

  it('persists to localStorage and restores', () => {
    cart.add(product({ step: '1' }));
    const restored = new CartStore();
    expect(restored.items().length).toBe(1);
    expect(restored.items()[0].cityProductId).toBe(11);
  });
});

import { TestBed } from '@angular/core/testing';
import { CartPanel } from './cart-panel';
import { CartStore } from '../../../core/cart/cart.store';
import { Product } from '../../../core/api/models/catalog.models';

function product(over: Partial<Product> = {}): Product {
  return {
    id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
    step: '1', category: 1, price: '19300.00', is_available: true, stock: 0, ...over,
  };
}

describe('CartPanel', () => {
  let cart: CartStore;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [CartPanel], providers: [CartStore] });
    cart = TestBed.inject(CartStore);
  });

  it('lists cart items and the formatted total', async () => {
    cart.add(product());
    const fixture = TestBed.createComponent(CartPanel);
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Olma');
    expect(text).toContain('19 300 сум');
  });

  it('shows an empty message when the cart is empty', async () => {
    const fixture = TestBed.createComponent(CartPanel);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent.toLowerCase()).toContain('savat');
  });
});

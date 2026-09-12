import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
    TestBed.configureTestingModule({ imports: [CartPanel], providers: [CartStore, provideRouter([])] });
    cart = TestBed.inject(CartStore);
  });

  it('lists cart items and the formatted total', async () => {
    cart.add(product());
    const fixture = TestBed.createComponent(CartPanel);
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Olma');
    expect(text).toContain("19 300 so'm");
  });

  it('shows an empty message when the cart is empty', async () => {
    const fixture = TestBed.createComponent(CartPanel);
    await fixture.whenStable();
    const empty = fixture.nativeElement.querySelector('.empty');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('bo');
    expect(fixture.nativeElement.querySelector('.row')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.clear')).toBeFalsy();
  });

  it('links "Buyurtma berish" to /checkout', async () => {
    cart.add(product());
    const fixture = TestBed.createComponent(CartPanel);
    await fixture.whenStable();
    const link = fixture.nativeElement.querySelector('a.order') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('/checkout');
  });

  it('removes one line and clears everything', async () => {
    cart.add(product());
    cart.add(product({ city_product_id: 12, name: 'Non', price: '4300.00' }));
    const fixture = TestBed.createComponent(CartPanel);
    await fixture.whenStable();
    (fixture.nativeElement.querySelector('.remove') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(cart.count()).toBe(1);
    (fixture.nativeElement.querySelector('.clear') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(cart.count()).toBe(0);
  });
});

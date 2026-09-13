import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FloatingCart } from './floating-cart';
import { CartStore } from '../../../core/cart/cart.store';

@Component({ standalone: true, template: '' })
class Stub {}

describe('FloatingCart', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [FloatingCart],
      providers: [CartStore, provideRouter([
        { path: 'cart', component: Stub }, { path: 'checkout', component: Stub }, { path: '**', component: Stub },
      ])],
    });
    TestBed.inject(CartStore).add({ id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
      step: '1', category: 1, price: '19300.00', is_available: true, stock: 0 });
  });

  it('shows the pill with the total when the cart has items', async () => {
    const fixture = TestBed.createComponent(FloatingCart);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.pill')?.textContent).toContain("19 300 so'm");
  });

  it('hides itself on the checkout page', async () => {
    await TestBed.inject(Router).navigateByUrl('/checkout');
    const fixture = TestBed.createComponent(FloatingCart);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.pill')).toBeNull();
  });

  it('hides itself on the cart page it links to', async () => {
    await TestBed.inject(Router).navigateByUrl('/cart');
    const fixture = TestBed.createComponent(FloatingCart);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.pill')).toBeNull();
  });
});

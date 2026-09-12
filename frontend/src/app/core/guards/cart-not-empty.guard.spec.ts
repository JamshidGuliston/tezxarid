import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { cartNotEmptyGuard } from './cart-not-empty.guard';
import { CartStore } from '../cart/cart.store';

describe('cartNotEmptyGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), CartStore] });
  });

  const run = () =>
    TestBed.runInInjectionContext(() =>
      cartNotEmptyGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

  it('redirects home when the cart is empty', () => {
    const result = run() as UrlTree;
    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/');
  });

  it('allows navigation when the cart has items', () => {
    TestBed.inject(CartStore).add({
      id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
      step: '1', category: 1, price: '19300.00', is_available: true, stock: 0,
    });
    expect(run()).toBe(true);
  });
});

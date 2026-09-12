import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CartStore } from '../cart/cart.store';

/** /checkout makes no sense with an empty cart — send the user home instead. */
export const cartNotEmptyGuard: CanActivateFn = () => {
  const cart = inject(CartStore);
  const router = inject(Router);
  return cart.count() > 0 ? true : router.createUrlTree(['/']);
};

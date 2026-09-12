import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OrderStore } from '../orders/order.store';

/**
 * /checkout/success only makes sense right after an order was placed in this session
 * (guests cannot re-fetch orders). A hard refresh or direct visit goes home instead —
 * as a guard (not a constructor redirect) so the history entry is replaced, not pushed,
 * and the Back button keeps working.
 */
export const orderExistsGuard: CanActivateFn = () => {
  const store = inject(OrderStore);
  const router = inject(Router);
  return store.lastOrder() ? true : router.createUrlTree(['/']);
};

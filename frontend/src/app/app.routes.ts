import { Routes } from '@angular/router';
import { cartNotEmptyGuard } from './core/guards/cart-not-empty.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
  { path: 'category/:id', loadComponent: () => import('./features/category/category').then((m) => m.Category) },
  { path: 'cart', loadComponent: () => import('./features/cart/cart-page').then((m) => m.CartPage) },
  // TODO(Task 14): add `checkout/success` -> OrderSuccess *above* the 'checkout' entry,
  // so the prefix route never shadows it. The component does not exist yet and a lazy
  // `import()` of a missing module fails the typecheck (app.config.spec.ts pulls this file in).
  { path: 'checkout', canActivate: [cartNotEmptyGuard], loadComponent: () => import('./features/checkout/checkout').then((m) => m.Checkout) },
  { path: '**', redirectTo: '' },
];

import { Routes } from '@angular/router';
import { cartNotEmptyGuard } from './core/guards/cart-not-empty.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
  { path: 'category/:id', loadComponent: () => import('./features/category/category').then((m) => m.Category) },
  { path: 'cart', loadComponent: () => import('./features/cart/cart-page').then((m) => m.CartPage) },
  // 'checkout/success' is listed before 'checkout' so the prefix route never shadows it.
  { path: 'checkout/success', loadComponent: () => import('./features/checkout/order-success').then((m) => m.OrderSuccess) },
  { path: 'checkout', canActivate: [cartNotEmptyGuard], loadComponent: () => import('./features/checkout/checkout').then((m) => m.Checkout) },
  { path: '**', redirectTo: '' },
];

import { Routes } from '@angular/router';
import { cartNotEmptyGuard } from './core/guards/cart-not-empty.guard';
import { orderExistsGuard } from './core/guards/order-exists.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
  { path: 'category/:id', loadComponent: () => import('./features/category/category').then((m) => m.Category) },
  { path: 'cart', loadComponent: () => import('./features/cart/cart-page').then((m) => m.CartPage) },
  // Most specific first (stylistic: a leaf route never matches leftover URL segments anyway).
  { path: 'checkout/success', canActivate: [orderExistsGuard], loadComponent: () => import('./features/checkout/order-success').then((m) => m.OrderSuccess) },
  { path: 'checkout', canActivate: [cartNotEmptyGuard], loadComponent: () => import('./features/checkout/checkout').then((m) => m.Checkout) },
  { path: '**', redirectTo: '' },
];

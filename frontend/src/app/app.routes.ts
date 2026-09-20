import { Routes } from '@angular/router';
import { Shell } from './layout/shell/shell';
import { cartNotEmptyGuard } from './core/guards/cart-not-empty.guard';
import { orderExistsGuard } from './core/guards/order-exists.guard';
import { operatorGuard } from './core/operator/operator.guard';

export const routes: Routes = [
  // Operator console: its own shell, its own session. Listed first so '' does not swallow it.
  { path: 'order-admin/login', loadComponent: () => import('./features/order-admin/admin-login').then((m) => m.AdminLogin) },
  {
    path: 'order-admin',
    canActivate: [operatorGuard],
    loadComponent: () => import('./layout/admin-shell/admin-shell').then((m) => m.AdminShell),
    // Tasks 8, 9 and 12 append their own child routes (board, detail, customers, customer detail).
    children: [
      { path: '', loadComponent: () => import('./features/order-admin/orders-board').then((m) => m.OrdersBoard) },
      { path: 'orders/:id', loadComponent: () => import('./features/order-admin/order-detail').then((m) => m.OrderDetail) },
      { path: 'customers', loadComponent: () => import('./features/order-admin/customers').then((m) => m.Customers) },
      { path: 'customers/:id', loadComponent: () => import('./features/order-admin/customer-detail').then((m) => m.CustomerDetail) },
    ],
  },
  {
    path: '',
    component: Shell,
    children: [
      { path: '', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
      { path: 'category/:id', loadComponent: () => import('./features/category/category').then((m) => m.Category) },
      { path: 'cart', loadComponent: () => import('./features/cart/cart-page').then((m) => m.CartPage) },
      { path: 'search', loadComponent: () => import('./features/search/search').then((m) => m.Search) },
      { path: 'orders', loadComponent: () => import('./features/orders/orders').then((m) => m.Orders) },
      { path: 'profile', loadComponent: () => import('./features/profile/profile').then((m) => m.Profile) },
      // Most specific first (stylistic: a leaf route never matches leftover URL segments anyway).
      { path: 'checkout/success', canActivate: [orderExistsGuard], loadComponent: () => import('./features/checkout/order-success').then((m) => m.OrderSuccess) },
      { path: 'checkout', canActivate: [cartNotEmptyGuard], loadComponent: () => import('./features/checkout/checkout').then((m) => m.Checkout) },
    ],
  },
  { path: '**', redirectTo: '' },
];

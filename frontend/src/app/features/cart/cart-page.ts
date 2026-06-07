import { Component } from '@angular/core';
import { CartPanel } from '../../shared/ui/cart-panel/cart-panel';

@Component({
  selector: 'tx-cart-page',
  standalone: true,
  imports: [CartPanel],
  template: `<tx-cart-panel />`,
})
export class CartPage {}

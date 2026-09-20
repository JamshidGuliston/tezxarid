import { TestBed } from '@angular/core/testing';
import { ProductGrid } from './product-grid';
import { CartStore } from '../../../core/cart/cart.store';
import { Product } from '../../../core/api/models/catalog.models';

const OLMA: Product = { id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
  step: '1', category: 1, price: '19300.00', is_available: true, stock: 0 };

describe('ProductGrid', () => {
  beforeEach(() => { localStorage.clear(); TestBed.configureTestingModule({ imports: [ProductGrid], providers: [CartStore] }); });

  it('renders a card per product and adds to the cart', async () => {
    const fixture = TestBed.createComponent(ProductGrid);
    fixture.componentRef.setInput('products', [OLMA]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tx-product-card').length).toBe(1);
    (fixture.nativeElement.querySelector('.add-btn') as HTMLButtonElement).click();
    expect(TestBed.inject(CartStore).count()).toBe(1);
  });

  it('shows the configurable empty text', async () => {
    const fixture = TestBed.createComponent(ProductGrid);
    fixture.componentRef.setInput('products', []);
    fixture.componentRef.setInput('emptyText', 'Hech narsa topilmadi');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Hech narsa topilmadi');
  });
});

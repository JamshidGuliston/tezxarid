import { TestBed } from '@angular/core/testing';
import { ProductCard } from './product-card';
import { Product } from '../../../core/api/models/catalog.models';

function product(over: Partial<Product> = {}): Product {
  return {
    id: 1, city_product_id: 11, name: 'Olma Saltanat', image: '', unit: 'kg',
    step: '1', category: 1, price: '19300.00', is_available: true, stock: 0, ...over,
  };
}

describe('ProductCard', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ProductCard] }));

  it('shows name, formatted price and unit label', async () => {
    const fixture = TestBed.createComponent(ProductCard);
    fixture.componentRef.setInput('product', product());
    fixture.componentRef.setInput('qty', 0);
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Olma Saltanat');
    expect(text).toContain('19 300 сум');
    expect(text).toContain('кг');
  });

  it('emits add when the + button is clicked and qty is 0', async () => {
    const fixture = TestBed.createComponent(ProductCard);
    fixture.componentRef.setInput('product', product());
    fixture.componentRef.setInput('qty', 0);
    let added = 0;
    fixture.componentInstance.add.subscribe(() => added++);
    await fixture.whenStable();
    fixture.nativeElement.querySelector('.add-btn').click();
    expect(added).toBe(1);
  });

  it('shows a stepper instead of + when qty > 0', async () => {
    const fixture = TestBed.createComponent(ProductCard);
    fixture.componentRef.setInput('product', product());
    fixture.componentRef.setInput('qty', 2);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('tx-qty-stepper')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.add-btn')).toBeFalsy();
  });
});

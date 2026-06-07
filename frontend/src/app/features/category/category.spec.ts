import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { Category } from './category';

describe('Category feature', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Category],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(new Map([['id', '3']])) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('loads products for the route category and renders cards', async () => {
    const fixture = TestBed.createComponent(Category);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url.endsWith('/products/') && r.params.get('category') === '3');
    req.flush([{
      id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
      step: '1', category: 3, price: '19300.00', is_available: true, stock: 0,
    }]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Olma');
    expect(fixture.nativeElement.querySelector('tx-product-card')).toBeTruthy();
  });
});

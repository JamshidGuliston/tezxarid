import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { convertToParamMap } from '@angular/router';
import { Search } from './search';
import { CartStore } from '../../core/cart/cart.store';

const OLMA = { id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
  step: '1', category: 1, price: '19300.00', is_available: true, stock: 0 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Search', () => {
  let http: HttpTestingController;

  function setup(initialQ = '') {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Search],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), CartStore,
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(initialQ ? { q: initialQ } : {}) } } }],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Search);
    fixture.detectChanges();
    return fixture;
  }

  it('asks for at least two characters and sends nothing for one', async () => {
    const fixture = setup();
    fixture.componentInstance.query.set('o');
    await wait(400);
    http.expectNone((r) => r.url.endsWith('/products/'));
    expect(fixture.nativeElement.textContent).toContain('Kamida 2 ta harf');
  });

  it('debounces typing and searches the last term', async () => {
    const fixture = setup();
    fixture.componentInstance.query.set('ol');
    await wait(100);
    fixture.componentInstance.query.set('olm');
    await wait(400);
    const req = http.expectOne((r) => r.url.endsWith('/products/') && r.params.get('search') === 'olm');
    req.flush([OLMA]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tx-product-card').length).toBe(1);
    http.verify();
  });

  it('shows an empty state and an error state with retry', async () => {
    const fixture = setup();
    fixture.componentInstance.query.set('zzz');
    await wait(400);
    http.expectOne((r) => r.params.get('search') === 'zzz').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Hech narsa topilmadi');

    fixture.componentInstance.query.set('non');
    await wait(400);
    http.expectOne((r) => r.params.get('search') === 'non').flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('xatolik');
    (fixture.nativeElement.querySelector('button.link') as HTMLButtonElement).click();
    await wait(400);
    http.expectOne((r) => r.params.get('search') === 'non').flush([OLMA]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tx-product-card').length).toBe(1);
  });

  it('starts from the ?q= query parameter', async () => {
    const fixture = setup('banan');
    expect((fixture.nativeElement.querySelector('input') as HTMLInputElement).value).toBe('banan');
    await wait(400);
    http.expectOne((r) => r.params.get('search') === 'banan').flush([]);
  });
});

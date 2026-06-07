import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { CatalogApi } from './catalog-api';

describe('CatalogApi', () => {
  let api: CatalogApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CatalogApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CatalogApi);
    http = TestBed.inject(HttpTestingController);
  });

  it('getCities hits /api/cities/', () => {
    api.getCities().subscribe();
    const req = http.expectOne('http://localhost:8000/api/cities/');
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, name: 'Toshkent', slug: 'toshkent' }]);
    http.verify();
  });

  it('getProducts adds category and search params', () => {
    api.getProducts(5, 'olm').subscribe();
    const req = http.expectOne((r) => r.url === 'http://localhost:8000/api/products/');
    expect(req.request.params.get('category')).toBe('5');
    expect(req.request.params.get('search')).toBe('olm');
    req.flush([]);
    http.verify();
  });
});

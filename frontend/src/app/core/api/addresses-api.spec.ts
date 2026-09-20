import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AddressesApi } from './addresses-api';

describe('AddressesApi', () => {
  it('lists, creates, updates and removes addresses', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(AddressesApi);
    const http = TestBed.inject(HttpTestingController);
    const base = 'http://localhost:8000/api/addresses/';

    api.list().subscribe();
    expect(http.expectOne(base).request.method).toBe('GET');
    api.create({ city: 1, title: 'Uy', address: 'Chilonzor 5', latitude: 41.31, longitude: 69.24, is_default: true }).subscribe();
    const c = http.expectOne(base);
    expect(c.request.method).toBe('POST');
    expect(c.request.body.title).toBe('Uy');
    api.update(7, { is_default: true }).subscribe();
    const u = http.expectOne(`${base}7/`);
    expect(u.request.method).toBe('PATCH');
    expect(u.request.body).toEqual({ is_default: true });
    api.remove(7).subscribe();
    expect(http.expectOne(`${base}7/`).request.method).toBe('DELETE');
  });
});

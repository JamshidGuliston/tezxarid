import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { OperatorApi } from './operator-api';

const BASE = 'http://localhost:8000/api';

describe('OperatorApi', () => {
  let api: OperatorApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(OperatorApi);
    http = TestBed.inject(HttpTestingController);
  });

  it('calls every operator endpoint with the right method and url', () => {
    api.login('op', 'secret').subscribe();
    const login = http.expectOne(`${BASE}/auth/login/`);
    expect(login.request.method).toBe('POST');
    expect(login.request.body).toEqual({ username: 'op', password: 'secret' });

    api.stages().subscribe();
    expect(http.expectOne(`${BASE}/operator/stages/`).request.method).toBe('GET');

    api.orders({ stage: 'new', q: 'ali', date: '2026-09-21' }).subscribe();
    const list = http.expectOne((r) => r.url === `${BASE}/operator/orders/`);
    expect(list.request.params.get('stage')).toBe('new');
    expect(list.request.params.get('q')).toBe('ali');
    expect(list.request.params.get('date')).toBe('2026-09-21');

    api.order(5).subscribe();
    expect(http.expectOne(`${BASE}/operator/orders/5/`).request.method).toBe('GET');

    api.patchOrder(5, { comment: 'tez' }).subscribe();
    const patch = http.expectOne(`${BASE}/operator/orders/5/`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ comment: 'tez' });

    api.replaceItems(5, [{ city_product: 2, qty: '1.000' }]).subscribe();
    const items = http.expectOne(`${BASE}/operator/orders/5/items/`);
    expect(items.request.method).toBe('PUT');
    expect(items.request.body).toEqual({ items: [{ city_product: 2, qty: '1.000' }] });

    api.moveStage(5, 'accepted', 'ok').subscribe();
    expect(http.expectOne(`${BASE}/operator/orders/5/stage/`).request.body).toEqual({ stage: 'accepted', note: 'ok' });

    api.logEvent(5, 'called').subscribe();
    expect(http.expectOne(`${BASE}/operator/orders/5/events/`).request.body).toEqual({ kind: 'called', note: '' });

    api.products('ol').subscribe();
    expect(http.expectOne((r) => r.url === `${BASE}/operator/products/`).request.params.get('search')).toBe('ol');

    api.customers('ali').subscribe();
    expect(http.expectOne((r) => r.url === `${BASE}/operator/customers/`).request.params.get('q')).toBe('ali');

    api.customer(9).subscribe();
    expect(http.expectOne(`${BASE}/operator/customers/9/`).request.method).toBe('GET');
    http.verify();
  });
});

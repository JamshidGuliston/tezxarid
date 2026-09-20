import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { operatorInterceptor } from './operator.interceptor';
import { OperatorStore } from './operator.store';

const API = 'http://localhost:8000/api';
const OPERATOR = { id: 1, username: 'op', first_name: '', role: 'city_admin', city: 1, city_name: 'Guliston' };

describe('operatorInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let store: OperatorStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([operatorInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    store = TestBed.inject(OperatorStore);
  });

  it('leaves customer calls alone and signs operator calls', () => {
    store.set({ access: 'a', refresh: 'r', user: OPERATOR });
    http.get(`${API}/products/`).subscribe();
    expect(ctrl.expectOne(`${API}/products/`).request.headers.has('Authorization')).toBe(false);
    http.get(`${API}/operator/orders/`).subscribe();
    const req = ctrl.expectOne(`${API}/operator/orders/`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer a');
    expect(req.request.headers.has('X-City-Id')).toBe(false);
  });

  it('sends the picked city for a global operator', () => {
    store.set({ access: 'a', refresh: 'r', user: { ...OPERATOR, role: 'superadmin', city: null, city_name: '' } });
    store.selectCity(4);
    http.get(`${API}/operator/orders/`).subscribe();
    expect(ctrl.expectOne(`${API}/operator/orders/`).request.headers.get('X-City-Id')).toBe('4');
  });

  it('refreshes once on 401 and retries', () => {
    store.set({ access: 'old', refresh: 'r', user: OPERATOR });
    let body: unknown;
    http.get(`${API}/operator/orders/`).subscribe((b) => (body = b));
    ctrl.expectOne(`${API}/operator/orders/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${API}/auth/token/refresh/`).flush({ access: 'new' });
    const retry = ctrl.expectOne(`${API}/operator/orders/`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
    retry.flush([{ id: 1 }]);
    expect(body).toEqual([{ id: 1 }]);
    ctrl.verify();
  });

  it('signs the operator out when the refresh fails', () => {
    store.set({ access: 'old', refresh: 'r', user: OPERATOR });
    let status = 0;
    http.get(`${API}/operator/orders/`).subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne(`${API}/operator/orders/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${API}/auth/token/refresh/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(status).toBe(401);
    expect(store.isOperator()).toBe(false);
    ctrl.verify();
  });
});

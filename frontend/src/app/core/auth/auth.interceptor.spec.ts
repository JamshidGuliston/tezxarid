import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { TokenStore } from './token.store';

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let tokens: TokenStore;
  const API = 'http://localhost:8000/api';

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStore);
  });

  it('adds a Bearer header when signed in and none when not', () => {
    http.get(`${API}/orders/`).subscribe();
    expect(ctrl.expectOne(`${API}/orders/`).request.headers.has('Authorization')).toBe(false);
    tokens.set({ access: 'a', refresh: 'r' });
    http.get(`${API}/orders/`).subscribe();
    expect(ctrl.expectOne(`${API}/orders/`).request.headers.get('Authorization')).toBe('Bearer a');
  });

  it('never touches the auth endpoints', () => {
    tokens.set({ access: 'a', refresh: 'r' });
    http.post(`${API}/auth/telegram/`, {}).subscribe();
    expect(ctrl.expectOne(`${API}/auth/telegram/`).request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes once on 401 and retries the original request', () => {
    tokens.set({ access: 'old', refresh: 'r' });
    let body: unknown;
    http.get(`${API}/orders/`).subscribe((b) => (body = b));
    ctrl.expectOne(`${API}/orders/`).flush({ detail: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    const refresh = ctrl.expectOne(`${API}/auth/token/refresh/`);
    expect(refresh.request.body).toEqual({ refresh: 'r' });
    refresh.flush({ access: 'new' });
    const retry = ctrl.expectOne(`${API}/orders/`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
    retry.flush([{ id: 1 }]);
    expect(body).toEqual([{ id: 1 }]);
    expect(tokens.access()).toBe('new');
    ctrl.verify();
  });

  it('shares one refresh between concurrent 401s', () => {
    tokens.set({ access: 'old', refresh: 'r' });
    http.get(`${API}/orders/`).subscribe();
    http.get(`${API}/auth/me/`).subscribe();
    ctrl.expectOne(`${API}/orders/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${API}/auth/me/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${API}/auth/token/refresh/`).flush({ access: 'new' });
    ctrl.expectOne(`${API}/orders/`).flush([]);
    ctrl.expectOne(`${API}/auth/me/`).flush({});
    ctrl.verify();
  });

  it('signs out when the refresh itself fails and surfaces the original 401', () => {
    tokens.set({ access: 'old', refresh: 'r' });
    let status = 0;
    http.get(`${API}/orders/`).subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne(`${API}/orders/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${API}/auth/token/refresh/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(status).toBe(401);
    expect(tokens.isAuthenticated()).toBe(false);
    ctrl.verify();
  });
});

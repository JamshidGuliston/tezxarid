import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthApi } from './auth-api';

describe('AuthApi', () => {
  let api: AuthApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  it('exchanges initData, refreshes, reads and patches the profile', () => {
    api.telegram('init=1').subscribe();
    const t = http.expectOne('http://localhost:8000/api/auth/telegram/');
    expect(t.request.method).toBe('POST');
    expect(t.request.body).toEqual({ init_data: 'init=1' });
    t.flush({ access: 'a', refresh: 'r' });

    api.refresh('r').subscribe();
    const r = http.expectOne('http://localhost:8000/api/auth/token/refresh/');
    expect(r.request.body).toEqual({ refresh: 'r' });
    r.flush({ access: 'a2' });

    api.me().subscribe();
    expect(http.expectOne('http://localhost:8000/api/auth/me/').request.method).toBe('GET');

    api.updateMe({ phone: '+998901234567' }).subscribe();
    const p = http.expectOne('http://localhost:8000/api/auth/me/');
    expect(p.request.method).toBe('PATCH');
    expect(p.request.body).toEqual({ phone: '+998901234567' });
    http.verify();
  });
});

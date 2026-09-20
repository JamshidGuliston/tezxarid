import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { appConfig } from './app.config';
import { CityService } from './core/city/city.service';
import { AuthService } from './core/auth/auth.service';
import { TokenStore } from './core/auth/token.store';

describe('appConfig', () => {
  describe('as a guest', () => {
    let http: HttpTestingController;
    let initStatus: ApplicationInitStatus;

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({
        providers: [...appConfig.providers, provideHttpClientTesting()],
      });
      http = TestBed.inject(HttpTestingController); // module init kicks off the initializer
      initStatus = TestBed.inject(ApplicationInitStatus);
    });

    it('blocks startup until the active city is resolved', async () => {
      let done = false;
      void initStatus.donePromise.then(() => (done = true));
      await Promise.resolve();
      expect(done).toBe(false); // still waiting on the cities request
      http.expectOne((r) => r.url.endsWith('/cities/')).flush([{ id: 5, name: 'Toshkent', slug: 'toshkent' }]);
      await initStatus.donePromise;
      expect(TestBed.inject(CityService).activeCity()?.id).toBe(5);
      http.verify();
    });

    it('still starts the app when the cities request fails', async () => {
      http.expectOne((r) => r.url.endsWith('/cities/')).flush('boom', { status: 500, statusText: 'Server Error' });
      await initStatus.donePromise; // must resolve, not reject
      expect(TestBed.inject(CityService).activeCity()).toBeNull();
      http.verify();
    });

    it('starts with no active city when the list is empty', async () => {
      http.expectOne((r) => r.url.endsWith('/cities/')).flush([]);
      await initStatus.donePromise;
      expect(TestBed.inject(CityService).activeCity()).toBeNull();
      http.verify();
    });

    it('keeps errorInterceptor silent when authInterceptor already refreshed and retried a 401', () => {
      TestBed.inject(TokenStore).set({ access: 'old', refresh: 'r' });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let body: unknown;
      TestBed.inject(HttpClient).get('http://localhost:8000/api/orders/').subscribe((b) => (body = b));
      http.expectOne((r) => r.url.endsWith('/orders/')).flush({}, { status: 401, statusText: 'Unauthorized' });
      http.expectOne((r) => r.url.endsWith('/auth/token/refresh/')).flush({ access: 'new' });
      http.expectOne((r) => r.url.endsWith('/orders/')).flush([]);
      http.expectOne((r) => r.url.endsWith('/cities/')).flush([]); // initializer's own request
      expect(body).toEqual([]);
      expect(errorSpy).not.toHaveBeenCalled();
      http.verify();
      errorSpy.mockRestore();
    });
  });

  describe('inside Telegram', () => {
    beforeEach(() => {
      localStorage.clear();
      (window as { Telegram?: unknown }).Telegram = { WebApp: {
        initData: 'init=1', initDataUnsafe: { user: { id: 7 } }, ready() {}, expand() {},
        BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} }, isVersionAtLeast: () => true,
        requestContact() {}, openTelegramLink() {}, openLink() {},
      } };
      TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    });

    afterEach(() => { delete (window as { Telegram?: unknown }).Telegram; });

    it('signs in through Telegram in parallel with the city lookup when the SDK is present', async () => {
      const http = TestBed.inject(HttpTestingController);
      const initStatus = TestBed.inject(ApplicationInitStatus);
      http.expectOne((r) => r.url.endsWith('/cities/')).flush([{ id: 1, name: 'Guliston', slug: 'guliston' }]);
      http.expectOne((r) => r.url.endsWith('/auth/telegram/')).flush({ access: 'a', refresh: 'r' });
      await Promise.resolve();
      http.expectOne((r) => r.url.endsWith('/auth/me/')).flush({ id: 7, telegram_id: 7, first_name: 'Aziz', last_name: '',
        phone: '', city: null, date_joined: '2026-09-20T10:15:00+05:00' });
      await initStatus.donePromise;
      expect(TestBed.inject(AuthService).me()?.id).toBe(7);
      http.verify();
    });
  });
});

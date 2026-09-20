import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { TokenStore } from './token.store';
import { CustomerStore } from '../customer/customer.store';
import { TelegramService } from '../telegram/telegram.service';

const ME = { id: 7, telegram_id: 7, first_name: 'Aziz', last_name: 'Karimov', phone: '+998901234567',
  city: null, date_joined: '2026-09-20T10:15:00+05:00' };

function installTelegram(over: Record<string, unknown> = {}) {
  (window as { Telegram?: unknown }).Telegram = { WebApp: {
    initData: 'init=1', initDataUnsafe: { user: { id: 7 } }, ready() {}, expand() {},
    BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
    isVersionAtLeast: () => true,
    requestContact: (cb: (sent: boolean, e?: unknown) => void) =>
      cb(true, { responseUnsafe: { contact: { phone_number: '+998 90 111 22 33' } } }),
    openTelegramLink() {}, openLink() {}, ...over,
  } };
}

describe('AuthService', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { delete (window as { Telegram?: unknown }).Telegram; });

  it('does nothing outside Telegram', async () => {
    const svc = TestBed.inject(AuthService);
    await svc.initFromTelegram();
    http.expectNone(() => true);
    expect(svc.isAuthenticated()).toBe(false);
  });

  it('signs in with initData, loads /me and seeds empty customer fields only', async () => {
    installTelegram();
    TestBed.inject(CustomerStore).save({ phone: '+998900000000' });
    const svc = TestBed.inject(AuthService);
    const done = svc.initFromTelegram();
    http.expectOne((r) => r.url.endsWith('/auth/telegram/')).flush({ access: 'a', refresh: 'r' });
    await Promise.resolve();
    http.expectOne((r) => r.url.endsWith('/auth/me/')).flush(ME);
    await done;
    expect(svc.isAuthenticated()).toBe(true);
    expect(svc.me()?.id).toBe(7);
    const info = TestBed.inject(CustomerStore).info();
    expect(info.name).toBe('Aziz Karimov');
    expect(info.phone).toBe('+998900000000'); // existing value kept
  });

  it('stays a guest when Telegram auth is rejected', async () => {
    installTelegram();
    const svc = TestBed.inject(AuthService);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const done = svc.initFromTelegram();
    http.expectOne((r) => r.url.endsWith('/auth/telegram/')).flush({ detail: 'bad hash' }, { status: 400, statusText: 'Bad Request' });
    await done;
    http.expectNone((r) => r.url.endsWith('/auth/me/'));
    expect(svc.isAuthenticated()).toBe(false);
    expect(TestBed.inject(TokenStore).access()).toBeNull();
    warn.mockRestore();
  });

  it('keeps the session when only /me fails', async () => {
    installTelegram();
    const svc = TestBed.inject(AuthService);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const done = svc.initFromTelegram();
    http.expectOne((r) => r.url.endsWith('/auth/telegram/')).flush({ access: 'a', refresh: 'r' });
    await Promise.resolve();
    http.expectOne((r) => r.url.endsWith('/auth/me/')).flush('boom', { status: 500, statusText: 'Server Error' });
    await done;
    expect(svc.isAuthenticated()).toBe(true);
    expect(svc.me()).toBeNull();
    warn.mockRestore();
  });

  it('updateMe patches the server and mirrors the customer store', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    const svc = TestBed.inject(AuthService);
    const done = svc.updateMe({ first_name: 'Anvar', last_name: '' });
    const req = http.expectOne((r) => r.url.endsWith('/auth/me/') && r.method === 'PATCH');
    req.flush({ ...ME, first_name: 'Anvar', last_name: '' });
    await done;
    expect(svc.me()?.first_name).toBe('Anvar');
    expect(TestBed.inject(CustomerStore).info().name).toBe('Anvar');
  });

  it('requestPhone takes the number from Telegram and saves it', async () => {
    installTelegram();
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    expect(TestBed.inject(TelegramService).canRequestContact).toBe(true);
    const svc = TestBed.inject(AuthService);
    const done = svc.requestPhone();
    await new Promise((r) => setTimeout(r));
    const req = http.expectOne((r) => r.url.endsWith('/auth/me/') && r.method === 'PATCH');
    expect(req.request.body).toEqual({ phone: '+998901112233' });
    req.flush({ ...ME, phone: '+998901112233' });
    await expect(done).resolves.toBe('+998901112233');
  });

  it('requestPhone keeps the number on the device when the server patch fails', async () => {
    installTelegram();
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    const svc = TestBed.inject(AuthService);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const done = svc.requestPhone();
    await new Promise((r) => setTimeout(r));
    const req = http.expectOne((r) => r.url.endsWith('/auth/me/') && r.method === 'PATCH');
    req.flush('boom', { status: 500, statusText: 'Server Error' });
    await expect(done).resolves.toBe('+998901112233');
    expect(TestBed.inject(CustomerStore).info().phone).toBe('+998901112233');
    warn.mockRestore();
  });

  it('clears me when signed out from under it (e.g. a failed token refresh)', () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    const svc = TestBed.inject(AuthService);
    svc.me.set(ME);
    TestBed.inject(TokenStore).clear();
    TestBed.tick();
    expect(svc.me()).toBeNull();
  });
});

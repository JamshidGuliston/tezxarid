import { TestBed } from '@angular/core/testing';
import { TelegramService, TelegramWebApp } from './telegram.service';

function fakeWebApp(over: Partial<TelegramWebApp> = {}): TelegramWebApp & { calls: string[] } {
  const calls: string[] = [];
  const app = {
    calls,
    initData: 'query_id=1&user=%7B%22id%22%3A7%7D&hash=abc',
    initDataUnsafe: { user: { id: 7, first_name: 'Aziz' } },
    ready: () => calls.push('ready'),
    expand: () => calls.push('expand'),
    BackButton: {
      show: () => calls.push('back.show'), hide: () => calls.push('back.hide'),
      onClick: () => calls.push('back.onClick'), offClick: () => calls.push('back.offClick'),
    },
    isVersionAtLeast: () => true,
    requestContact: (cb) => cb(true, { responseUnsafe: { contact: { phone_number: '+998 90 123 45 67' } } }),
    openTelegramLink: (url) => calls.push('tg:' + url),
    openLink: (url) => calls.push('link:' + url),
    ...over,
  } as TelegramWebApp & { calls: string[] };
  return app;
}

describe('TelegramService', () => {
  afterEach(() => { delete (window as { Telegram?: unknown }).Telegram; });

  it('is a safe no-op outside Telegram', async () => {
    const svc = TestBed.inject(TelegramService);
    expect(svc.isTelegram).toBe(false);
    expect(svc.initData).toBe('');
    expect(svc.user).toBeNull();
    expect(svc.canRequestContact).toBe(false);
    expect(() => { svc.ready(); svc.setBackButton(true, () => {}); }).not.toThrow();
    await expect(svc.requestContact()).resolves.toBeNull();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    svc.openLink('https://t.me/tezxaridbot');
    expect(open).toHaveBeenCalledWith('https://t.me/tezxaridbot', '_blank', 'noopener');
    open.mockRestore();
  });

  it('wraps the WebApp when running inside Telegram', async () => {
    const app = fakeWebApp();
    (window as { Telegram?: unknown }).Telegram = { WebApp: app };
    const svc = TestBed.inject(TelegramService);
    expect(svc.isTelegram).toBe(true);
    expect(svc.initData).toBe(app.initData);
    expect(svc.user?.id).toBe(7);
    svc.ready();
    expect(app.calls).toEqual(['ready', 'expand']);
    svc.setBackButton(true, () => {});
    expect(app.calls.slice(-2)).toEqual(['back.onClick', 'back.show']);
    svc.setBackButton(false, () => {});
    expect(app.calls.slice(-3)).toEqual(['back.offClick', 'back.onClick', 'back.hide']);
    await expect(svc.requestContact()).resolves.toBe('+998901234567');
    svc.openLink('https://t.me/tezxaridbot');
    svc.openLink('https://example.com/oferta');
    expect(app.calls.slice(-2)).toEqual(['tg:https://t.me/tezxaridbot', 'link:https://example.com/oferta']);
  });

  it('returns null when the contact was not shared or is not a +998 number', async () => {
    (window as { Telegram?: unknown }).Telegram = { WebApp: fakeWebApp({ requestContact: (cb) => cb(false) }) };
    await expect(TestBed.inject(TelegramService).requestContact()).resolves.toBeNull();
  });

  it('routes telegram.me links in-app and ignores non-http schemes', () => {
    const app = fakeWebApp();
    (window as { Telegram?: unknown }).Telegram = { WebApp: app };
    const svc = TestBed.inject(TelegramService);
    svc.openLink('https://Telegram.me/tezxaridbot');
    svc.openLink('tg://resolve?domain=x');
    svc.openLink('mailto:a@b.c');
    expect(app.calls).toEqual(['tg:https://Telegram.me/tezxaridbot']);
  });

  it('passes the very handler it registered to offClick', () => {
    const seen: Array<() => void> = [];
    const app = fakeWebApp({ BackButton: { show() {}, hide() {}, onClick: (cb) => { seen.push(cb); }, offClick: (cb) => { seen.push(cb); } } });
    (window as { Telegram?: unknown }).Telegram = { WebApp: app };
    const svc = TestBed.inject(TelegramService);
    const first = () => {};
    const second = () => {};
    svc.setBackButton(true, first);
    svc.setBackButton(true, second);
    expect(seen).toEqual([first, first, second]); // onClick(first), offClick(first), onClick(second)
  });

  it('never asks the SDK below 6.9, returns null for foreign numbers, and shares a pending request', async () => {
    (window as { Telegram?: unknown }).Telegram = { WebApp: fakeWebApp({
      isVersionAtLeast: () => false, requestContact: () => { throw new Error('must not be called'); } }) };
    await expect(TestBed.inject(TelegramService).requestContact()).resolves.toBeNull();

    TestBed.resetTestingModule();
    (window as { Telegram?: unknown }).Telegram = { WebApp: fakeWebApp({
      requestContact: (cb) => cb(true, { responseUnsafe: { contact: { phone_number: '+77012345678' } } }) }) };
    await expect(TestBed.inject(TelegramService).requestContact()).resolves.toBeNull();

    TestBed.resetTestingModule();
    let calls = 0;
    let pending: Parameters<TelegramWebApp['requestContact']>[0] | null = null;
    (window as { Telegram?: unknown }).Telegram = { WebApp: fakeWebApp({
      requestContact: (cb) => { calls++; if (pending) throw new Error('WebAppContactRequested'); pending = cb; } }) };
    const svc = TestBed.inject(TelegramService);
    const a = svc.requestContact();
    const b = svc.requestContact();
    expect(b).toBe(a);
    pending!(true, { responseUnsafe: { contact: { phone_number: '998901234567' } } });
    await expect(a).resolves.toBe('+998901234567');
    expect(calls).toBe(1);
  });
});

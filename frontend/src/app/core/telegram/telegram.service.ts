import { Injectable } from '@angular/core';

export interface TelegramUser { id: number; first_name?: string; last_name?: string; username?: string; }
interface ContactEvent { responseUnsafe?: { contact?: { phone_number?: string } }; }
/** The subset of window.Telegram.WebApp this app uses (SDK: telegram-web-app.js). */
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser };
  ready(): void;
  expand(): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  isVersionAtLeast(version: string): boolean;
  requestContact(cb: (sent: boolean, event?: ContactEvent) => void): void;
  openTelegramLink(url: string): void;
  openLink(url: string): void;
}
declare global { interface Window { Telegram?: { WebApp?: TelegramWebApp } } }

/** Thin wrapper over the Telegram Mini App SDK; every method is a safe no-op in a normal browser. */
@Injectable({ providedIn: 'root' })
export class TelegramService {
  private readonly app: TelegramWebApp | null =
    typeof window !== 'undefined' && window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null;
  private backHandler: (() => void) | null = null;

  readonly isTelegram = this.app !== null;
  readonly canRequestContact =
    !!this.app && typeof this.app.isVersionAtLeast === 'function' && this.app.isVersionAtLeast('6.9');

  get initData(): string { return this.app?.initData ?? ''; }
  get user(): TelegramUser | null { return this.app?.initDataUnsafe.user ?? null; }

  /** Tell Telegram the app is ready and take the full height. */
  ready(): void {
    this.app?.ready();
    this.app?.expand();
  }

  setBackButton(visible: boolean, onClick: () => void): void {
    if (!this.app) return;
    if (this.backHandler) this.app.BackButton.offClick(this.backHandler);
    this.backHandler = onClick;
    this.app.BackButton.onClick(onClick);
    if (visible) this.app.BackButton.show(); else this.app.BackButton.hide();
  }

  private contactPending: Promise<string | null> | null = null;

  /** Ask Telegram for the user's phone; resolves '+998XXXXXXXXX', or null when declined, unsupported,
   *  not an Uzbek number, or when a request is already pending (the SDK throws on a second one). */
  requestContact(): Promise<string | null> {
    if (!this.app || !this.canRequestContact) return Promise.resolve(null);
    if (this.contactPending) return this.contactPending;
    const app = this.app;
    this.contactPending = new Promise<string | null>((resolve) => {
      try {
        app.requestContact((sent, event) => {
          const digits = (event?.responseUnsafe?.contact?.phone_number ?? '').replace(/\D/g, '');
          const local = digits.startsWith('998') ? digits.slice(3) : digits;
          resolve(sent && /^\d{9}$/.test(local) ? `+998${local}` : null);
        });
      } catch {
        resolve(null);
      }
    }).finally(() => { this.contactPending = null; });
    return this.contactPending;
  }

  openLink(url: string): void {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return; }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
    if (!this.app) { window.open(url, '_blank', 'noopener'); return; }
    const host = parsed.hostname.toLowerCase();
    if (host === 't.me' || host === 'telegram.me') this.app.openTelegramLink(url); else this.app.openLink(url);
  }
}

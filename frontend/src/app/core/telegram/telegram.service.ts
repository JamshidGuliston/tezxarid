import { Injectable } from '@angular/core';
import { normalizePhone } from '../../shared/ui/phone-input/phone-input';

export interface TelegramUser { id: number; first_name?: string; last_name?: string; username?: string; }
interface ContactEvent { status?: string; responseUnsafe?: { contact?: { phone_number?: string } }; }
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
  readonly canRequestContact = !!this.app && this.app.isVersionAtLeast('6.9');

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

  /** Ask Telegram for the user's phone; resolves '+998XXXXXXXXX' or null (declined / unsupported / foreign). */
  requestContact(): Promise<string | null> {
    if (!this.app || !this.canRequestContact) return Promise.resolve(null);
    const app = this.app;
    return new Promise((resolve) => {
      app.requestContact((sent, event) => {
        const raw = event?.responseUnsafe?.contact?.phone_number ?? '';
        const digits = normalizePhone(raw);
        resolve(sent && digits.length === 9 ? `+998${digits}` : null);
      });
    });
  }

  openLink(url: string): void {
    if (!this.app) { window.open(url, '_blank', 'noopener'); return; }
    if (/^https:\/\/t\.me\//.test(url)) this.app.openTelegramLink(url); else this.app.openLink(url);
  }
}

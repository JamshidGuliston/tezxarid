import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { AuthApi } from '../api/auth-api';
import { Me, MePatch } from '../api/models/auth.models';
import { CustomerInfo, CustomerStore } from '../customer/customer.store';
import { TelegramService } from '../telegram/telegram.service';
import { TokenStore } from './token.store';

export function fullName(me: Me): string {
  return `${me.first_name} ${me.last_name}`.trim();
}

/** Silent Telegram sign-in and the signed-in profile; guests simply never get a token. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(AuthApi);
  private tokens = inject(TokenStore);
  private telegram = inject(TelegramService);
  private customer = inject(CustomerStore);

  readonly me = signal<Me | null>(null);
  readonly isAuthenticated = this.tokens.isAuthenticated;

  constructor() {
    // Signed out from under us (e.g. a failed token refresh clears the tokens) — drop the stale profile.
    effect(() => { if (!this.isAuthenticated()) this.me.set(null); });
  }

  /** Called from the app initializer. Never rejects: any failure leaves the user a guest. */
  async initFromTelegram(): Promise<void> {
    if (!this.telegram.isTelegram) return;
    try {
      const pair = await firstValueFrom(this.api.telegram(this.telegram.initData).pipe(timeout(8_000)));
      this.tokens.set(pair);
    } catch (err) {
      console.warn('Telegram sign-in failed; continuing as guest', err);
      this.tokens.clear();
      return;
    }
    try {
      await this.loadMe();
    } catch (err) {
      console.warn('Profile load failed; session kept', err);
    }
  }

  async loadMe(): Promise<void> {
    const me = await firstValueFrom(this.api.me());
    this.me.set(me);
    this.seedCustomer(me);
  }

  async updateMe(patch: MePatch): Promise<Me> {
    const me = await firstValueFrom(this.api.updateMe(patch));
    this.me.set(me);
    const sync: Partial<CustomerInfo> = {};
    if (fullName(me)) sync.name = fullName(me);
    if (me.phone) sync.phone = me.phone;
    if (Object.keys(sync).length) this.customer.save(sync);
    return me;
  }

  /** Ask Telegram for the phone number and store it (server when signed in, device otherwise). */
  async requestPhone(): Promise<string | null> {
    const phone = await this.telegram.requestContact();
    if (!phone) return null;
    if (this.isAuthenticated()) {
      try {
        await this.updateMe({ phone });
      } catch (err) {
        console.warn('Phone save failed; kept on device', err);
        this.customer.save({ phone });
      }
    } else {
      this.customer.save({ phone });
    }
    return phone;
  }

  /** Fill only what the device does not already know — a guest's own edits win. */
  private seedCustomer(me: Me): void {
    const info = this.customer.info();
    const patch: Partial<CustomerInfo> = {};
    if (!info.name && fullName(me)) patch.name = fullName(me);
    if (!info.phone && me.phone) patch.phone = me.phone;
    if (Object.keys(patch).length) this.customer.save(patch);
  }
}

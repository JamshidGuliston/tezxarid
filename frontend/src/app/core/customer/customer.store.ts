import { Injectable, signal } from '@angular/core';

export interface CustomerInfo {
  name: string;
  phone: string;          // '+998XXXXXXXXX' or ''
  address: string;
  latitude: number | null;
  longitude: number | null;
}

const STORAGE_KEY = 'tezxarid.customer';
const EMPTY: CustomerInfo = { name: '', phone: '', address: '', latitude: null, longitude: null };

/** Remembers the guest's contact details between checkouts (Plan 3c seeds it from Telegram). */
@Injectable({ providedIn: 'root' })
export class CustomerStore {
  readonly info = signal<CustomerInfo>(this.load());

  save(patch: Partial<CustomerInfo>): void {
    this.info.update((cur) => ({ ...cur, ...patch }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.info()));
    } catch {
      // Storage blocked or full — keep the in-memory value; never abort the caller's flow.
    }
  }

  private load(): CustomerInfo {
    try {
      return { ...EMPTY, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<CustomerInfo>) };
    } catch {
      return { ...EMPTY };
    }
  }
}

import { Injectable, computed, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { TokenPair } from '../api/models/auth.models';

const STORAGE_KEY = 'tezxarid.auth';

/** JWT pair for the signed-in Telegram user; absent for guests. */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  readonly access = signal<string | null>(null);
  readonly refresh = signal<string | null>(null);
  readonly isAuthenticated = computed(() => this.access() !== null);
  /** The in-flight refresh shared by concurrent 401s (owned by authInterceptor). */
  refreshing: Observable<string> | null = null;

  constructor() {
    try {
      const pair = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as TokenPair | null;
      if (pair?.access && pair?.refresh) { this.access.set(pair.access); this.refresh.set(pair.refresh); }
    } catch { /* corrupt storage → signed out */ }
  }

  set(pair: TokenPair): void {
    this.access.set(pair.access);
    this.refresh.set(pair.refresh);
    this.persist();
  }

  setAccess(access: string): void {
    this.access.set(access);
    this.persist();
  }

  clear(): void {
    this.access.set(null);
    this.refresh.set(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ access: this.access(), refresh: this.refresh() }));
    } catch { /* storage blocked or full — session lives in memory */ }
  }
}

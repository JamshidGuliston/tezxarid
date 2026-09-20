import { Injectable, computed, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { OperatorSession, OperatorUser } from '../api/models/operator.models';

const STORAGE_KEY = 'tezxarid.operator';
const GLOBAL_ROLES = new Set(['superadmin']);

/** The operator console's own session, kept apart from the customer's Telegram session. */
@Injectable({ providedIn: 'root' })
export class OperatorStore {
  readonly access = signal<string | null>(null);
  readonly refresh = signal<string | null>(null);
  readonly operator = signal<OperatorUser | null>(null);
  readonly isOperator = computed(() => this.access() !== null && this.operator() !== null);
  readonly isGlobal = computed(() => GLOBAL_ROLES.has(this.operator()?.role ?? ''));
  /** City chosen by a global operator; a city operator is pinned server-side. */
  readonly pickedCity = signal<number | null>(null);
  /** The in-flight refresh shared by concurrent 401s (owned by operatorInterceptor). */
  refreshing: Observable<string> | null = null;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as OperatorSession | null;
      if (saved?.access && saved?.refresh && saved?.user) {
        this.access.set(saved.access);
        this.refresh.set(saved.refresh);
        this.operator.set(saved.user);
      }
    } catch { /* corrupt storage → signed out */ }
  }

  set(session: OperatorSession): void {
    this.access.set(session.access);
    this.refresh.set(session.refresh);
    this.operator.set(session.user);
    this.pickedCity.set(null);
    this.persist();
  }

  setAccess(access: string): void {
    this.access.set(access);
    this.persist();
  }

  selectCity(cityId: number | null): void {
    this.pickedCity.set(cityId);
  }

  /** The X-City-Id an operator request should carry, or null when the server decides. */
  headerCityId(): number | null {
    return this.isGlobal() ? this.pickedCity() : null;
  }

  signOut(): void {
    this.access.set(null);
    this.refresh.set(null);
    this.operator.set(null);
    this.pickedCity.set(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(
        { access: this.access(), refresh: this.refresh(), user: this.operator() }));
    } catch { /* storage blocked — session lives in memory */ }
  }
}

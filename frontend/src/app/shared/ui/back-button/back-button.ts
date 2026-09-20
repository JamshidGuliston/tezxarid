import { Location } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Event as RouterEvent, NavigationEnd, NavigationStart, Router } from '@angular/router';
import { filter, map, startWith, tap } from 'rxjs';
import { TelegramService } from '../../../core/telegram/telegram.service';

/** history.state key carrying the page's position in the in-app history. */
const DEPTH_KEY = 'txDepth';

/** Floating "back" control shown on every page except home; Telegram's native BackButton mirrors it. */
@Component({
  selector: 'tx-back-button',
  standalone: true,
  template: `
    @if (visible()) {
      <button type="button" class="back" aria-label="Orqaga" (click)="back()">←</button>
    }
  `,
  styles: [`
    .back { position: fixed; left: 1rem; bottom: calc(var(--tx-nav-h) + 1rem); z-index: 25;
      width: 3rem; height: 3rem; border-radius: 50%; border: none; background: #fff; color: #1a1a1a;
      font-size: 1.4rem; line-height: 1; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,.2); }
    .back:focus-visible { outline: 2px solid #F60; outline-offset: 2px; }
    @media (min-width: 900px) { .back { bottom: 1.5rem; } }
  `],
})
export class BackButton {
  private router = inject(Router);
  private location = inject(Location);
  private telegram = inject(TelegramService);
  /**
   * 1-based position of the current page in the in-app history. 1 means nothing of ours lies
   * behind it (the first page after a deep link), so "back" must go home rather than leave the app.
   * The depth is stamped onto history.state after every navigation: browser back/forward (popstate)
   * restores the depth of the entry it lands on, and replaceUrl / skipLocationChange navigations
   * (e.g. Search syncing `?q=`) keep the depth of the page they replace.
   */
  private depth = 0;
  private pending: { restored: number | null; pushes: boolean } = { restored: null, pushes: true };

  visible = toSignal(
    this.router.events.pipe(
      tap((e) => this.trackDepth(e)),
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects !== '/'),
      startWith(this.router.url !== '/'),
    ),
    { initialValue: false },
  );

  constructor() {
    effect(() => this.telegram.setBackButton(this.visible(), () => this.back()));
  }

  back(): void {
    if (this.depth > 1) this.location.back();
    else void this.router.navigateByUrl('/');
  }

  private trackDepth(e: RouterEvent): void {
    if (e instanceof NavigationStart) {
      const extras = this.router.getCurrentNavigation()?.extras;
      this.pending = {
        restored: e.navigationTrigger === 'popstate' ? stampedDepth(e.restoredState) : null,
        pushes: !extras?.replaceUrl && !extras?.skipLocationChange,
      };
    } else if (e instanceof NavigationEnd) {
      const { restored, pushes } = this.pending;
      if (restored !== null) this.depth = restored;
      else if (pushes || this.depth === 0) this.depth++; // the app's first navigation replaces the entry it started on
      this.location.replaceState(this.location.path(true), '', {
        ...(this.location.getState() as Record<string, unknown> | null),
        [DEPTH_KEY]: this.depth,
      });
    }
  }
}

function stampedDepth(state: NavigationStart['restoredState']): number {
  const depth = state?.[DEPTH_KEY];
  return typeof depth === 'number' ? depth : 1; // an entry we never stamped is the oldest we know of
}

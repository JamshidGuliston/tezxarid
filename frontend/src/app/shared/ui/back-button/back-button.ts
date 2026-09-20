import { Location } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith, tap } from 'rxjs';
import { TelegramService } from '../../../core/telegram/telegram.service';

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
  /** In-app navigations so far; more than one means there is an in-app page to go back to. */
  private navCount = 0;

  visible = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      tap(() => this.navCount++),
      map((e) => e.urlAfterRedirects !== '/'),
      startWith(this.router.url !== '/'),
    ),
    { initialValue: false },
  );

  constructor() {
    effect(() => this.telegram.setBackButton(this.visible(), () => this.back()));
  }

  back(): void {
    if (this.navCount > 1) this.location.back();
    else void this.router.navigateByUrl('/');
  }
}

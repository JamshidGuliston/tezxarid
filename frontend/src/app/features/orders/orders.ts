import { Component, computed, inject, signal } from '@angular/core';
import { OrdersApi } from '../../core/api/orders-api';
import { Order } from '../../core/api/models/order.models';
import { AuthService } from '../../core/auth/auth.service';
import { OrderHistoryStore } from '../../core/orders/order-history.store';
import { OrderCard } from '../../shared/ui/order-card/order-card';
import { isActiveStatus } from '../../shared/utils/order-status';

type Tab = 'active' | 'past';
type LoadState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'tx-orders',
  standalone: true,
  imports: [OrderCard],
  template: `
    <div class="page">
      <h2 class="title">Buyurtmalar</h2>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'active'" [class.on]="tab() === 'active'" (click)="tab.set('active')">Faol</button>
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'past'" [class.on]="tab() === 'past'" (click)="tab.set('past')">Tarix</button>
      </div>
      @if (isLocal()) { <p class="note">Bu qurilmada berilgan buyurtmalar. Holat yangilanmaydi.</p> }
      @switch (state()) {
        @case ('loading') { <p class="hint">Yuklanmoqda…</p> }
        @case ('error') {
          <p class="hint" role="status">Buyurtmalar yuklanmadi.
            <button type="button" class="link" (click)="load()">Qayta urinish</button>
          </p>
        }
        @case ('ready') {
          @for (o of shown(); track o.id) {
            <tx-order-card [order]="o" [local]="isLocal()" />
          } @empty {
            <div class="empty"><div class="icon" aria-hidden="true">📦</div>{{ tab() === 'active' ? "Faol buyurtma yo'q" : "Tarix bo'sh" }}</div>
          }
        }
      }
    </div>
  `,
  styles: [`
    .page { max-width: 640px; margin: 0 auto; padding-bottom: 1rem; }
    .title { text-align: center; margin: 1rem 0 .5rem; font-size: 1.3rem; }
    .tabs { display: flex; margin: 0 1rem .75rem; background: #f3f3f3; border-radius: 999px; padding: .25rem; }
    .tabs button { flex: 1; border: none; border-radius: 999px; padding: .55rem; background: none; font: inherit; font-weight: 600; color: #595959; cursor: pointer; }
    .tabs button.on { background: #F60; color: #fff; }
    .note { margin: 0 1rem .75rem; color: #767676; font-size: .85rem; }
    .hint { color: #767676; text-align: center; padding: 2rem 1rem; }
    .link { border: none; background: none; color: #F60; font-weight: 700; cursor: pointer; font: inherit; }
    .empty { text-align: center; color: #767676; padding: 3rem 1rem; }
    .icon { font-size: 2.5rem; opacity: .5; margin-bottom: .5rem; }
  `],
})
export class Orders {
  private api = inject(OrdersApi);
  private auth = inject(AuthService);
  private history = inject(OrderHistoryStore);

  tab = signal<Tab>('active');
  state = signal<LoadState>('ready');
  private server = signal<Order[]>([]);

  isLocal = computed(() => !this.auth.isAuthenticated());
  private source = computed(() => (this.isLocal() ? this.history.orders() : this.server()));
  shown = computed(() => this.source().filter((o) => (this.tab() === 'active' ? isActiveStatus(o.status) : !isActiveStatus(o.status))));

  constructor() {
    if (!this.isLocal()) this.load();
  }

  load(): void {
    this.state.set('loading');
    this.api.listOrders().subscribe({
      next: (list) => { this.server.set(list); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }
}

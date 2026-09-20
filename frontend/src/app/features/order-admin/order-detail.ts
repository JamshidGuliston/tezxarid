import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { OperatorApi } from '../../core/api/operator-api';
import { OperatorOrder, OperatorStage } from '../../core/api/models/operator.models';
import { OrdersApi } from '../../core/api/orders-api';
import { DeliveryDay } from '../../core/api/models/order.models';
import { SumPipe } from '../../shared/pipes/sum.pipe';

/** One order, open in front of the operator while they are on the phone with the customer. */
@Component({
  selector: 'tx-order-detail',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, SumPipe, DatePipe],
  template: `
    @if (order(); as o) {
      <div class="page">
        <div class="top">
          <a routerLink="/order-admin" class="back">← Ro'yxat</a>
          <h1>№ {{ o.id }}</h1>
          <span class="customer">{{ o.customer_name }}</span>
          <span class="stage">{{ o.stage_name }}</span>
        </div>

        @if (error(); as msg) { <p class="err" role="alert">{{ msg }}</p> }
        @if (saved()) { <p class="ok" role="status">Saqlandi</p> }

        <section class="card">
          <div class="callrow">
            <a class="call" [href]="'tel:' + o.phone" (click)="logCall()">📞 {{ o.phone }}</a>
            <button type="button" class="ghost" (click)="print()">Chekni chop etish</button>
          </div>
          <form [formGroup]="form" class="grid">
            <label><span>Mijoz</span><input formControlName="customer_name" maxlength="120" /></label>
            <label><span>Telefon</span><input formControlName="phone" maxlength="20" /></label>
            <label class="wide"><span>Manzil</span><input formControlName="address" maxlength="500" /></label>
            <label class="wide"><span>Izoh</span><input formControlName="comment" maxlength="500" /></label>
            <label><span>Yetkazish kuni</span>
              <select formControlName="delivery_date">
                @for (d of days(); track d.date) { <option [value]="d.date">{{ d.date }}</option> }
              </select>
            </label>
            <label><span>Vaqt oralig'i</span>
              <select formControlName="delivery_slot_id">
                @for (s of slotsForDay(); track s.id) { <option [value]="s.id">{{ s.start }} – {{ s.end }}</option> }
              </select>
            </label>
          </form>
          @if (!o.is_terminal) {
            <button type="button" class="primary" [disabled]="busy()" (click)="save()">O'zgarishlarni saqlash</button>
          }
        </section>

        <section class="card">
          <h2>Mahsulotlar</h2>
          <ul class="items">
            @for (i of o.items; track i.id) {
              <li><span>{{ i.name }}</span><span>{{ i.qty }} {{ i.unit }} × {{ i.price_snapshot | sum }}</span></li>
            }
          </ul>
          <div class="total"><span>Jami</span><b>{{ o.total | sum }}</b></div>
        </section>

        @if (!o.is_terminal) {
          <section class="card actions">
            @if (nextStage(); as next) {
              <button type="button" class="confirm" [disabled]="busy()" (click)="moveTo(next.code)">{{ next.name }} ✓</button>
            }
            <select #pick (change)="moveTo(pick.value)" aria-label="Bosqichni tanlash">
              <option value="">Bosqichni o'zgartirish…</option>
              @for (s of movableStages(); track s.id) { <option [value]="s.code">{{ s.name }}</option> }
            </select>
            @if (!cancelling()) {
              <button type="button" class="danger" (click)="cancelling.set(true)">Bekor qilish</button>
            } @else {
              <div class="cancel">
                <input #note placeholder="Bekor qilish sababi" [value]="cancelNote()" (input)="cancelNote.set(note.value)" />
                <button type="button" class="danger" (click)="cancel()">Tasdiqlash</button>
                <button type="button" class="ghost" (click)="cancelling.set(false)">Yopish</button>
              </div>
            }
          </section>
        }

        <section class="card">
          <h2>Tarix</h2>
          <ul class="events">
            @for (e of o.events; track e.id) {
              <li><b>{{ label(e.kind) }}</b> {{ e.to_stage_name }} <small>{{ e.actor_name }} · {{ e.created_at | date: 'dd.MM HH:mm' }}</small>
                @if (e.note) { <div class="note">{{ e.note }}</div> }
              </li>
            } @empty { <li class="muted">Hali yozuv yo'q</li> }
          </ul>
        </section>
      </div>
    } @else if (error(); as msg) {
      <p class="err" role="alert">{{ msg }}</p>
    }
  `,
  styles: [`
    .page { max-width: 48rem; margin: 0 auto; padding: 1rem; display: grid; gap: .75rem; }
    .top { display: flex; align-items: center; gap: 1rem; }
    .top h1 { margin: 0; font-size: 1.3rem; }
    .back { text-decoration: none; color: #444; }
    .customer { color: #444; }
    .stage { margin-left: auto; background: #fff4ec; color: #a34700; border-radius: 999px; padding: .2rem .7rem; font-size: .85rem; }
    .card { background: #fff; border-radius: 14px; padding: 1rem; }
    .card h2 { margin: 0 0 .5rem; font-size: 1rem; }
    .callrow { display: flex; gap: .5rem; align-items: center; margin-bottom: .75rem; }
    .call { text-decoration: none; background: #e8f7ee; color: #1a7f4b; font-weight: 700; border-radius: 999px; padding: .5rem 1rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
    .grid .wide { grid-column: 1 / -1; }
    label { display: grid; gap: .25rem; }
    label span { font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: #6b6b6b; }
    input, select { border: none; border-radius: 10px; background: #f3f3f3; padding: .6rem; font: inherit; }
    input:focus-visible, select:focus-visible { outline: 2px solid #F60; outline-offset: 2px; }
    .primary { margin-top: .75rem; border: none; border-radius: 12px; background: #F60; color: #fff; font: inherit;
      font-weight: 700; padding: .7rem 1.2rem; cursor: pointer; }
    .items { list-style: none; margin: 0; padding: 0; }
    .items li { display: flex; justify-content: space-between; gap: 1rem; padding: .35rem 0; border-bottom: 1px solid #f2f2f2; }
    .total { display: flex; justify-content: space-between; padding-top: .5rem; font-size: 1.05rem; }
    .actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
    .confirm { border: none; border-radius: 12px; background: #1a7f4b; color: #fff; font: inherit; font-weight: 700;
      padding: .7rem 1.2rem; cursor: pointer; }
    .danger { border: none; border-radius: 12px; background: #fff1f0; color: #b42318; font: inherit; font-weight: 700;
      padding: .7rem 1.2rem; cursor: pointer; }
    .ghost { border: 1px solid #d5d5d5; background: #fff; border-radius: 12px; padding: .6rem 1rem; font: inherit; cursor: pointer; }
    .cancel { display: flex; gap: .5rem; flex: 1 1 100%; }
    .cancel input { flex: 1; }
    .events { list-style: none; margin: 0; padding: 0; font-size: .9rem; }
    .events li { padding: .3rem 0; border-bottom: 1px solid #f2f2f2; }
    .events small { color: #6b6b6b; }
    .note { color: #444; }
    .muted { color: #767676; }
    .err { background: #fff1f0; color: #b42318; border-radius: 10px; padding: .6rem .9rem; margin: 0; }
    .ok { background: #e8f7ee; color: #1a7f4b; border-radius: 10px; padding: .6rem .9rem; margin: 0; }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class OrderDetail {
  private api = inject(OperatorApi);
  private ordersApi = inject(OrdersApi);
  private route = inject(ActivatedRoute);

  readonly id = Number(this.route.snapshot.paramMap.get('id'));
  order = signal<OperatorOrder | null>(null);
  stages = signal<OperatorStage[]>([]);
  days = signal<DeliveryDay[]>([]);
  busy = signal(false);
  saved = signal(false);
  error = signal<string | null>(null);
  cancelling = signal(false);
  cancelNote = signal('');

  form = inject(FormBuilder).nonNullable.group({
    customer_name: '', phone: '', address: '', comment: '',
    delivery_date: '', delivery_slot_id: 0,
  });

  /** The next stage in the pipeline, skipping cancel stages. */
  nextStage = computed(() => {
    const current = this.order()?.stage_id ?? null;
    const flow = this.stages().filter((s) => !s.is_canceled);
    const index = flow.findIndex((s) => s.id === current);
    return index >= 0 ? flow[index + 1] ?? null : flow[0] ?? null;
  });

  movableStages = computed(() => this.stages().filter((s) => !s.is_canceled && s.id !== this.order()?.stage_id));

  slotsForDay = computed(() => {
    const day = this.days().find((d) => d.date === this.form.controls.delivery_date.value);
    return day?.slots ?? [];
  });

  constructor() {
    this.load();
    this.api.stages().subscribe({ next: (list) => this.stages.set(list), error: () => this.stages.set([]) });
    this.ordersApi.getDeliverySlots().subscribe({ next: (days) => this.days.set(days), error: () => this.days.set([]) });
  }

  load(): void {
    this.api.order(this.id).subscribe({
      next: (order) => this.apply(order),
      error: () => this.error.set('Buyurtma topilmadi.'),
    });
  }

  private apply(order: OperatorOrder): void {
    this.order.set(order);
    this.form.setValue({
      customer_name: order.customer_name, phone: order.phone, address: order.address,
      comment: order.comment, delivery_date: order.delivery_date ?? '',
      delivery_slot_id: order.delivery_slot ?? 0,
    });
    if (order.is_terminal) this.form.disable({ emitEvent: false });
    else this.form.enable({ emitEvent: false });
  }

  save(): void {
    if (this.busy()) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.api.patchOrder(this.id, {
      customer_name: v.customer_name.trim(), phone: v.phone.trim(), address: v.address.trim(),
      comment: v.comment.trim(), delivery_date: v.delivery_date || null,
      delivery_slot_id: Number(v.delivery_slot_id) || null,
    }).subscribe({
      next: (order) => { this.apply(order); this.busy.set(false); this.saved.set(true); },
      error: (err: HttpErrorResponse) => { this.error.set(this.message(err)); this.busy.set(false); },
    });
  }

  moveTo(code: string): void {
    if (!code || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.moveStage(this.id, code).subscribe({
      next: (order) => { this.apply(order); this.busy.set(false); },
      error: (err: HttpErrorResponse) => { this.error.set(this.message(err)); this.busy.set(false); },
    });
  }

  cancel(): void {
    const note = this.cancelNote().trim();
    if (!note) { this.error.set('Bekor qilish uchun sabab yozing.'); return; }
    const canceled = this.stages().find((s) => s.is_canceled);
    if (!canceled) { this.error.set('Bu shaharda bekor qilish bosqichi sozlanmagan.'); return; }
    this.busy.set(true);
    this.api.moveStage(this.id, canceled.code, note).subscribe({
      next: (order) => { this.apply(order); this.cancelling.set(false); this.busy.set(false); },
      error: (err: HttpErrorResponse) => { this.error.set(this.message(err)); this.busy.set(false); },
    });
  }

  logCall(): void {
    this.api.logEvent(this.id, 'called').subscribe({ next: () => this.load(), error: () => { /* the call still happens */ } });
  }

  print(): void {
    this.api.logEvent(this.id, 'printed').subscribe({ next: () => { /* logged */ }, error: () => { /* ignore */ } });
    try { window.print(); } catch { /* headless */ }
  }

  label(kind: string): string {
    const map: Record<string, string> = { created: 'Yaratildi', stage: 'Bosqich', edited: 'Tahrirlandi',
      called: "Qo'ng'iroq", printed: 'Chop etildi' };
    return map[kind] ?? kind;
  }

  private message(err: HttpErrorResponse): string {
    const body = err.error as { detail?: string } | undefined;
    return body?.detail ?? "Saqlanmadi, qayta urinib ko'ring.";
  }
}

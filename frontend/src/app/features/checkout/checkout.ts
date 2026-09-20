import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { map } from 'rxjs';
import { AddressesApi } from '../../core/api/addresses-api';
import { Address } from '../../core/api/models/address.models';
import { OrdersApi } from '../../core/api/orders-api';
import { DeliveryDay, DeliverySelection, OrderCreatePayload } from '../../core/api/models/order.models';
import { AuthService } from '../../core/auth/auth.service';
import { CartStore } from '../../core/cart/cart.store';
import { CustomerStore } from '../../core/customer/customer.store';
import { OrderHistoryStore } from '../../core/orders/order-history.store';
import { OrderStore } from '../../core/orders/order.store';
import { SumPipe } from '../../shared/pipes/sum.pipe';
import { DeliveryPicker } from '../../shared/ui/delivery-picker/delivery-picker';
import { PhoneInput } from '../../shared/ui/phone-input/phone-input';

type FieldName = 'name' | 'phone' | 'address';
type SlotsState = 'loading' | 'ready' | 'error';

const MSG = {
  network: "Buyurtma yuborilmadi. Internetni tekshirib qayta urinib ko'ring.",
  items: "Ba'zi mahsulotlar hozir mavjud emas. Savatni tekshiring.",
  slot: 'Tanlangan vaqt endi mavjud emas, boshqa vaqtni tanlang.',
  fields: "Ma'lumotlarni tekshiring.",
  geoFail: "Joylashuv aniqlanmadi, manzilni qo'lda kiriting",
  geoOk: 'Joylashuv aniqlandi ✓',
  rejected: "Buyurtma qabul qilinmadi. Sahifani yangilab qayta urinib ko'ring.",
  navFailed: "Buyurtma qabul qilindi, lekin sahifa ochilmadi. Bosh sahifaga o'ting.",
  geoStored: 'Saqlangan joylashuv ishlatiladi',
  savedAddress: 'Saqlangan manzil tanlandi',
};

@Component({
  selector: 'tx-checkout',
  standalone: true,
  imports: [ReactiveFormsModule, DeliveryPicker, PhoneInput, SumPipe],
  template: `
    <div class="page">
      <h2 class="title">Ma'lumotlar</h2>

      @if (banner(); as msg) { <div class="banner" role="alert">{{ msg }}</div> }

      @switch (slotsState()) {
        @case ('loading') { <p class="muted pad">Yetkazish vaqtlari yuklanmoqda…</p> }
        @case ('error') {
          <div class="warn" role="status">Yetkazish vaqtlari yuklanmadi.
            <button type="button" class="link" (click)="loadSlots()">Qayta urinish</button>
          </div>
        }
        @case ('ready') {
          @if (noSlots()) {
            <div class="warn" role="status">Bu shaharda yetkazish vaqtlari hali sozlanmagan</div>
          } @else {
            <tx-delivery-picker [days]="days()" [(selection)]="selection" />
          }
        }
      }

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <section class="block">
          <h3>Ma'lumotlaringiz</h3>
          <label class="field">
            <span>Ismingiz</span>
            <input formControlName="name" placeholder="Ism va familiya" autocomplete="name"
              maxlength="120" [attr.aria-invalid]="fieldError('name') ? true : null" />
            @if (fieldError('name'); as msg) { <small class="err">{{ msg }}</small> }
          </label>
          <label class="field">
            <span>Telefon raqamingiz</span>
            <tx-phone-input formControlName="phone" />
            @if (fieldError('phone'); as msg) { <small class="err">{{ msg }}</small> }
          </label>
          @if (saved().length) {
            <div class="chips saved" aria-label="Saqlangan manzillar">
              @for (a of saved(); track a.id) {
                <button type="button" class="chip" [class.on]="form.controls.address.value === a.address" (click)="useAddress(a)">{{ a.title || a.address }}</button>
              }
            </div>
          }
          <label class="field">
            <span>Manzil</span>
            <input formControlName="address" placeholder="Ko'cha, uy, podyezd, kvartira" autocomplete="street-address"
              maxlength="500" [attr.aria-invalid]="fieldError('address') ? true : null" />
            @if (fieldError('address'); as msg) { <small class="err">{{ msg }}</small> }
          </label>
          <button type="button" class="geo" (click)="locate()">📍 Joylashuvni aniqlash</button>
          @if (geoMsg(); as msg) { <small class="muted" role="status">{{ msg }}</small> }
        </section>

        <section class="block">
          <h3>Kuryerga izoh <small class="muted">ixtiyoriy</small></h3>
          <div class="chips">
            @for (chip of chips; track chip) {
              <button type="button" class="chip" (click)="addChip(chip)">{{ chip }}</button>
            }
          </div>
          <textarea formControlName="comment" rows="2" placeholder="Masalan: 3-podyezd, 5-qavat"
            maxlength="500" aria-label="Kuryerga izoh"></textarea>
        </section>

        <section class="block summary">
          <div class="row"><span>Mahsulotlar</span><span>{{ cart.total() | sum }}</span></div>
          <div class="row grand"><span>Jami</span><span>{{ cart.total() | sum }}</span></div>
        </section>

        <div class="submit-bar">
          <button type="submit" class="submit" [disabled]="!canSubmit()">{{ buttonLabel() }}</button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .page { max-width: 640px; margin: 0 auto; padding-bottom: 1rem; }
    .title { text-align: center; margin: 1rem 0 .25rem; font-size: 1.3rem; }
    .pad { padding: 0 1rem; }
    .muted { color: #767676; font-size: .85rem; }
    .banner { margin: .5rem 1rem 0; padding: .75rem 1rem; border-radius: 12px; background: #fff1f0;
      color: #b42318; font-weight: 600; }
    .warn { margin: .75rem 1rem 0; padding: .75rem 1rem; border-radius: 12px; background: #fff8e6; color: #7a4b00; }
    .link { border: none; background: none; color: #F60; font-weight: 700; cursor: pointer; font: inherit; }
    .block { padding: .75rem 1rem 0; }
    h3 { margin: 0 0 .5rem; font-size: 1rem; }
    .field { display: block; margin-bottom: .75rem; }
    .field > span { display: block; font-size: .75rem; letter-spacing: .04em; text-transform: uppercase;
      color: #6b6b6b; margin-bottom: .3rem; }
    input, textarea { width: 100%; border: none; border-radius: 14px; background: #f3f3f3;
      padding: .9rem; font: inherit; outline: none; }
    input:focus-visible, textarea:focus-visible { outline: 2px solid #F60; outline-offset: 2px; }
    .err { display: block; color: #b42318; margin-top: .25rem; font-size: .8rem; }
    .geo { border: none; background: #f0f0f0; border-radius: 999px; padding: .5rem .9rem; cursor: pointer;
      margin-right: .5rem; font: inherit; }
    .chips { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: .5rem; }
    .chip { border: none; background: #f0f0f0; border-radius: 999px; padding: .45rem .8rem; cursor: pointer;
      font: inherit; font-size: .85rem; }
    .chip.on { background: #fff4ec; outline: 2px solid #F60; }
    .summary { margin-top: 1rem; }
    .row { display: flex; justify-content: space-between; padding: .35rem 0; color: #555; }
    .row.grand { color: #1a1a1a; font-weight: 800; font-size: 1.15rem; border-top: 1px solid #eee; margin-top: .25rem; padding-top: .6rem; }
    .submit-bar { position: sticky; bottom: var(--tx-nav-h); padding: .75rem 1rem 1rem; background: linear-gradient(transparent, #fff 30%); }
    .submit { width: 100%; border: none; border-radius: 14px; background: #F60; color: #fff; font-weight: 800;
      font-size: 1.05rem; padding: 1rem; cursor: pointer; box-shadow: 0 6px 16px rgba(255,102,0,.3); font-family: inherit;
      white-space: nowrap; }
    .submit:disabled { background: #e6e6e6; color: #6b6b6b; box-shadow: none; cursor: default; }
    @media (max-width: 672px) { .submit-bar { padding-left: 4.5rem; } } /* the 3rem floating back button at left: 1rem (plus a .5rem gutter) overlaps the page column only below 640px + gutters */
    @media (max-width: 380px) { .submit { font-size: .95rem; padding: .9rem .75rem; } }
  `],
})
export class Checkout {
  private fb = inject(FormBuilder).nonNullable;
  private api = inject(OrdersApi);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private sum = new SumPipe();
  private auth = inject(AuthService);
  private addressesApi = inject(AddressesApi);
  cart = inject(CartStore);
  customer = inject(CustomerStore);
  orders = inject(OrderStore);
  private history = inject(OrderHistoryStore);
  saved = signal<Address[]>([]);

  readonly chips = ["Qo'ng'iroq qiling", 'Eshik oldiga qoldiring'];

  days = signal<DeliveryDay[]>([]);
  slotsState = signal<SlotsState>('loading');
  selection = signal<DeliverySelection | null>(null);
  submitting = signal(false);
  banner = signal<string | null>(null);
  geo = signal<{ lat: number; lng: number } | null>(
    this.customer.info().latitude != null && this.customer.info().longitude != null
      ? { lat: this.customer.info().latitude!, lng: this.customer.info().longitude! }
      : null,
  );
  /** True while `geo` still holds the coordinates loaded from CustomerStore, i.e. coordinates
   *  captured for a *previous* address. A reading taken on this page clears it. */
  private geoFromStore = signal(this.geo() !== null);
  geoMsg = signal<string | null>(null);

  form = this.fb.group({
    name: [this.customer.info().name, [Validators.required, Validators.minLength(2)]],
    phone: [this.customer.info().phone, [Validators.required]],
    address: [this.customer.info().address, [Validators.required, Validators.minLength(5)]],
    comment: [''],
  });
  private formValid = toSignal(this.form.statusChanges.pipe(map(() => this.form.valid)), {
    initialValue: this.form.valid,
  });

  noSlots = computed(() => this.days().every((d) => d.slots.length === 0));
  // The cart panel stays interactive on desktop, so the cart can be emptied while this page is open.
  canSubmit = computed(() => !!this.selection() && this.formValid() && !this.submitting() && this.cart.count() > 0);
  buttonLabel = computed(() => {
    if (this.submitting()) return 'Yuborilmoqda…';
    if (this.cart.count() === 0) return "Savat bo'sh";
    if (!this.selection()) return 'Yetkazish vaqtini tanlang';
    if (!this.formValid()) return "Ma'lumotlarni to'ldiring";
    return `Buyurtma berish · ${this.sum.transform(this.cart.total())}`;
  });

  constructor() {
    this.loadSlots();
    if (this.geo()) this.geoMsg.set(MSG.geoStored);
    // Prefilled-but-invalid values must show their errors right away: the button is disabled,
    // so a submit attempt can never surface them.
    for (const c of [this.form.controls.name, this.form.controls.address]) {
      if (c.value && c.invalid) c.markAsTouched();
    }
    // Coordinates belong to the address they were captured for. Only *stored* ones are stale here:
    // a reading taken on this page was captured for the address the user is typing now.
    this.form.controls.address.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.geo() && this.geoFromStore()) {
        this.geo.set(null);
        this.geoMsg.set(null);
        this.geoFromStore.set(false);
      }
    });
    // A server-side field error is stale once the user edits the form.
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.banner() === MSG.fields) this.banner.set(null);
    });
    if (this.auth.isAuthenticated()) {
      this.addressesApi.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (list) => {
          this.saved.set(list);
          const preferred = list.find((a) => a.is_default);
          if (preferred && !this.form.controls.address.value) this.useAddress(preferred);
        },
        error: () => { /* chips are a convenience; typing still works */ },
      });
    }
  }

  loadSlots(): void {
    this.slotsState.set('loading');
    this.api.getDeliverySlots().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (days) => { this.days.set(days); this.slotsState.set('ready'); },
      error: () => this.slotsState.set('error'),
    });
  }

  addChip(text: string): void {
    const ctrl = this.form.controls.comment;
    const cur = ctrl.value.trim();
    if (cur.includes(text)) return;
    ctrl.setValue(cur ? `${cur}, ${text}` : text);
  }

  locate(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.geoMsg.set(MSG.geoFail);
      return;
    }
    this.geoMsg.set('Aniqlanmoqda…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Backend DecimalField(9,6): round to 6 decimals so a raw GPS reading is never rejected.
        this.geo.set({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) });
        this.geoFromStore.set(false);
        this.geoMsg.set(MSG.geoOk);
      },
      () => this.geoMsg.set(MSG.geoFail),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  useAddress(a: Address): void {
    this.geoFromStore.set(false);                 // these coordinates belong to the chosen address
    this.form.controls.address.setValue(a.address);
    if (a.latitude && a.longitude) {
      this.geo.set({ lat: Number(a.latitude), lng: Number(a.longitude) });
      this.geoMsg.set(MSG.savedAddress);
    } else {
      this.geo.set(null);
      this.geoMsg.set(null);
    }
  }

  fieldError(name: FieldName): string | null {
    const c = this.form.controls[name];
    const server = c.errors?.['server'];
    if (server) return String(server);
    if (!c.touched && !c.dirty) return null;
    if (c.errors?.['required']) return name === 'phone' ? "Telefon raqamini to'liq kiriting" : 'Majburiy maydon';
    if (c.errors?.['minlength']) return 'Juda qisqa';
    return null;
  }

  submit(): void {
    if (!this.canSubmit()) return;
    const sel = this.selection()!;
    const v = this.form.getRawValue();
    const geo = this.geo();
    const payload: OrderCreatePayload = {
      customer_name: v.name.trim(),
      phone: v.phone,
      address: v.address.trim(),
      comment: v.comment.trim(),
      payment_type: 'cash',
      delivery_date: sel.date,
      delivery_slot_id: sel.slot.id,
      items: this.cart.items().map((i) => ({ city_product: i.cityProductId, qty: String(i.qty) })),
      ...(geo ? { latitude: geo.lat, longitude: geo.lng } : {}),
    };
    this.submitting.set(true);
    this.banner.set(null);
    // No takeUntilDestroyed here on purpose: aborting a create request after the server committed it
    // would let the user re-submit and pay twice. The stores are root-scoped, so completing after
    // this component is destroyed is safe.
    this.api.createOrder(payload).subscribe({
      next: (order) => {
        this.orders.lastOrder.set(order);
        // Also for signed-in users: if the session lapses later, the device history is all /orders can show.
        this.history.add(order);
        this.customer.save({
          name: payload.customer_name, phone: payload.phone, address: payload.address,
          latitude: geo?.lat ?? null, longitude: geo?.lng ?? null,
        });
        this.cart.clear();
        this.router.navigate(['/checkout/success']).catch(() => {
          this.submitting.set(false);
          this.banner.set(MSG.navFailed);
        });
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.handleError(err);
      },
    });
  }

  private handleError(err: HttpErrorResponse): void {
    const body = err.status === 400 && err.error && typeof err.error === 'object'
      ? (err.error as Record<string, unknown>) : null;
    if (!body) { this.banner.set(MSG.network); return; }
    if (body['items']) { this.banner.set(MSG.items); return; }
    if (body['delivery_slot_id'] || body['delivery_date']) {
      this.selection.set(null);
      this.loadSlots();
      this.banner.set(MSG.slot);
      return;
    }
    const fieldMap: Record<string, FieldName> = { customer_name: 'name', phone: 'phone', address: 'address' };
    let anyField = false;
    for (const [key, ctrl] of Object.entries(fieldMap)) {
      const msg = body[key];
      if (msg) {
        this.form.controls[ctrl].setErrors({ server: Array.isArray(msg) ? String(msg[0]) : String(msg) });
        anyField = true;
      }
    }
    this.banner.set(anyField ? MSG.fields : MSG.rejected);
  }
}

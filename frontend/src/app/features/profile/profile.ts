import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService, fullName } from '../../core/auth/auth.service';
import { CartStore } from '../../core/cart/cart.store';
import { CityService } from '../../core/city/city.service';
import { CustomerStore } from '../../core/customer/customer.store';
import { TelegramService } from '../../core/telegram/telegram.service';
import { PhoneInput } from '../../shared/ui/phone-input/phone-input';
import { formatDayMonthYear } from '../../shared/utils/dates';
import { AddressBook } from './address-book';

export type ProfileSection = 'name' | 'phone' | 'city' | 'address';
const SAVE_FAILED = "Saqlanmadi, qayta urinib ko'ring";

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
}

@Component({
  selector: 'tx-profile',
  standalone: true,
  imports: [ReactiveFormsModule, PhoneInput, AddressBook],
  template: `
    <div class="page">
      <h2 class="title">Profil</h2>

      <section class="hero">
        <div class="avatar" aria-hidden="true">{{ initials() }}</div>
        <div>
          <div class="name">{{ name() || 'Ism kiritilmagan' }}</div>
          <div class="muted">{{ phone() || 'Telefon kiritilmagan' }}</div>
        </div>
      </section>

      @if (error(); as msg) { <div class="banner" role="alert">{{ msg }}</div> }

      <section class="rows">
        <button type="button" class="row" (click)="edit('name')">
          <span>Ism</span><span class="val">{{ name() || 'Kiritilmagan' }} ›</span>
        </button>
        @if (editing() === 'name') {
          <div class="editor">
            <input #nameBox [value]="nameDraft()" (input)="nameDraft.set(nameBox.value)" maxlength="120" placeholder="Ism va familiya" aria-label="Ism" />
            <div class="actions">
              <button type="button" class="primary" [disabled]="saving()" (click)="saveName()">Saqlash</button>
              <button type="button" (click)="cancel()">Bekor</button>
            </div>
          </div>
        }

        <button type="button" class="row" (click)="edit('phone')">
          <span>Telefon</span><span class="val">{{ phone() || 'Kiritilmagan' }} ›</span>
        </button>
        @if (editing() === 'phone') {
          <div class="editor">
            <tx-phone-input [formControl]="phoneCtrl" />
            @if (telegram.canRequestContact) {
              <button type="button" class="tg-phone" (click)="takePhoneFromTelegram()">Telegram'dan olish</button>
            }
            @if (phoneHint(); as hint) { <small class="muted" role="status">{{ hint }}</small> }
            <div class="actions">
              <button type="button" class="primary" [disabled]="saving()" (click)="savePhone()">Saqlash</button>
              <button type="button" (click)="cancel()">Bekor</button>
            </div>
          </div>
        }

        <button type="button" class="row" (click)="edit('city')">
          <span>Shahar</span><span class="val">{{ city.activeCity()?.name || '—' }} ›</span>
        </button>
        @if (editing() === 'city') {
          <div class="editor">
            <select #citySel [value]="cityDraft() ?? ''" (change)="cityDraft.set(+citySel.value)" aria-label="Shahar">
              @for (c of city.cities(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
            </select>
            <div class="actions">
              <button type="button" class="primary" [disabled]="saving()" (click)="saveCity()">Saqlash</button>
              <button type="button" (click)="cancel()">Bekor</button>
            </div>
          </div>
        }

        @if (!auth.isAuthenticated()) {
          <button type="button" class="row" (click)="edit('address')">
            <span>Manzil</span><span class="val">{{ customer.info().address || 'Kiritilmagan' }} ›</span>
          </button>
          @if (editing() === 'address') {
            <div class="editor">
              <input #addrBox [value]="addressDraft()" (input)="addressDraft.set(addrBox.value)" maxlength="500" placeholder="Ko'cha, uy, podyezd, kvartira" aria-label="Manzil" />
              <div class="actions">
                <button type="button" class="primary" (click)="saveAddress()">Saqlash</button>
                <button type="button" (click)="cancel()">Bekor</button>
              </div>
            </div>
          }
        }
      </section>

      @if (auth.isAuthenticated()) { <tx-address-book /> }

      @if (supportUrl || offerUrl) {
        <section class="rows">
          @if (supportUrl) {
            <a class="row" [href]="supportUrl" target="_blank" rel="noopener" (click)="open($event, supportUrl)"><span>Qo'llab-quvvatlash</span><span class="val">›</span></a>
          }
          @if (offerUrl) {
            <a class="row" [href]="offerUrl" target="_blank" rel="noopener" (click)="open($event, offerUrl)"><span>Ommaviy oferta</span><span class="val">›</span></a>
          }
        </section>
      }

      @if (joined(); as j) {
        <section class="rows"><div class="row static"><span>Ro'yxatdan o'tgan</span><span class="val">{{ j }}</span></div></section>
      }
    </div>
  `,
  styles: [`
    .page { max-width: 640px; margin: 0 auto; padding-bottom: 1rem; }
    .title { text-align: center; margin: 1rem 0 .5rem; font-size: 1.3rem; }
    .hero { display: flex; align-items: center; gap: 1rem; padding: .5rem 1rem 1rem; }
    .avatar { width: 3.5rem; height: 3.5rem; border-radius: 50%; background: linear-gradient(135deg, #F60, #ff9a5c);
      color: #fff; font-weight: 800; font-size: 1.2rem; display: grid; place-items: center; }
    .name { font-weight: 700; font-size: 1.1rem; }
    .muted { color: #6b6b6b; font-size: .9rem; }
    .banner { margin: 0 1rem .75rem; padding: .75rem 1rem; border-radius: 12px; background: #fff1f0; color: #b42318; font-weight: 600; }
    .rows { margin: 0 1rem .75rem; background: #fff; border: 1px solid #eee; border-radius: 14px; overflow: hidden; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; width: 100%;
      padding: .9rem 1rem; border: none; border-bottom: 1px solid #f0f0f0; background: none; font: inherit;
      color: #1a1a1a; text-decoration: none; text-align: left; cursor: pointer; }
    .row.static { cursor: default; }
    .rows > :last-child { border-bottom: none; }
    .val { color: #6b6b6b; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; }
    .editor { padding: .5rem 1rem 1rem; border-bottom: 1px solid #f0f0f0; background: #fafafa; }
    .editor input, .editor select { width: 100%; border: none; border-radius: 14px; background: #f3f3f3; padding: .85rem; font: inherit; }
    .editor input:focus-visible, .editor select:focus-visible { outline: 2px solid #F60; outline-offset: 2px; }
    .actions { display: flex; gap: .5rem; margin-top: .6rem; }
    .actions button, .tg-phone { border: none; border-radius: 999px; padding: .5rem 1rem; font: inherit; cursor: pointer; background: #ededed; }
    .actions .primary { background: #F60; color: #fff; font-weight: 700; }
    .tg-phone { margin-top: .5rem; background: #e8f1ff; color: #1d4ed8; }
  `],
})
export class Profile {
  auth = inject(AuthService);
  customer = inject(CustomerStore);
  city = inject(CityService);
  cart = inject(CartStore);
  telegram = inject(TelegramService);
  private router = inject(Router);

  readonly supportUrl = environment.supportUrl;
  readonly offerUrl = environment.offerUrl;

  editing = signal<ProfileSection | null>(null);
  nameDraft = signal('');
  phoneCtrl = new FormControl('', { nonNullable: true });
  cityDraft = signal<number | null>(null);
  addressDraft = signal('');
  saving = signal(false);
  error = signal<string | null>(null);
  phoneHint = signal<string | null>(null);

  name = computed(() => (this.auth.me() ? fullName(this.auth.me()!) : this.customer.info().name));
  phone = computed(() => this.auth.me()?.phone || this.customer.info().phone);
  initials = computed(() => initialsOf(this.name()));
  joined = computed(() => { const d = this.auth.me()?.date_joined; return d ? formatDayMonthYear(d) : null; });

  edit(section: ProfileSection): void {
    this.error.set(null);
    this.phoneHint.set(null);
    this.nameDraft.set(this.name());
    this.phoneCtrl.setValue(this.phone());
    this.cityDraft.set(this.city.cityId);
    this.addressDraft.set(this.customer.info().address);
    this.editing.set(section);
  }

  cancel(): void {
    this.editing.set(null);
    this.error.set(null);
  }

  async saveName(): Promise<void> {
    const name = this.nameDraft().trim();
    if (name.length < 2) { this.error.set('Ism juda qisqa'); return; }
    await this.persist(async () => {
      if (this.auth.isAuthenticated()) {
        const [first_name, ...rest] = name.split(/\s+/);
        await this.auth.updateMe({ first_name, last_name: rest.join(' ') });
      } else {
        this.customer.save({ name });
      }
    });
  }

  async savePhone(): Promise<void> {
    const phone = this.phoneCtrl.value;
    if (!phone) { this.error.set("Telefon raqamini to'liq kiriting"); return; }
    await this.persist(async () => {
      if (this.auth.isAuthenticated()) await this.auth.updateMe({ phone });
      else this.customer.save({ phone });
    });
  }

  async takePhoneFromTelegram(): Promise<void> {
    const phone = await this.auth.requestPhone();
    if (phone) { this.phoneCtrl.setValue(phone); this.editing.set(null); }
    else this.phoneHint.set("Telegram telefonni bermadi, qo'lda kiriting");
  }

  async saveCity(): Promise<void> {
    const target = this.city.cities().find((c) => c.id === this.cityDraft());
    if (!target || target.id === this.city.cityId) { this.editing.set(null); return; }
    if (this.cart.count() > 0 && !window.confirm("Shahar o'zgarsa savat tozalanadi. Davom etasizmi?")) return;
    this.cart.clear();
    this.city.setCity(target);
    if (this.auth.isAuthenticated()) {
      try { await this.auth.updateMe({ city: target.id }); } catch { /* the device choice still applies */ }
    }
    this.editing.set(null);
    void this.router.navigateByUrl('/');
  }

  saveAddress(): void {
    this.customer.save({ address: this.addressDraft().trim() });
    this.editing.set(null);
  }

  open(event: Event, url: string): void {
    if (!this.telegram.isTelegram) return;   // plain browsers follow the <a> normally
    event.preventDefault();
    this.telegram.openLink(url);
  }

  private async persist(work: () => Promise<void>): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await work();
      this.editing.set(null);
    } catch {
      this.error.set(SAVE_FAILED);
    } finally {
      this.saving.set(false);
    }
  }
}

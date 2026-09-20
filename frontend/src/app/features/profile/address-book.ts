import { Component, inject, signal } from '@angular/core';
import { AddressesApi } from '../../core/api/addresses-api';
import { Address } from '../../core/api/models/address.models';
import { CityService } from '../../core/city/city.service';

type State = 'loading' | 'ready' | 'error';
const SAVE_FAILED = "Saqlanmadi, qayta urinib ko'ring";

/** Signed-in user's saved addresses: list, add (with geolocation), make default, remove. */
@Component({
  selector: 'tx-address-book',
  standalone: true,
  template: `
    <section class="rows">
      <div class="row static"><span>Mening manzillarim</span>
        @if (!adding()) { <button type="button" class="add" (click)="startAdd()">+ Qo'shish</button> }
      </div>
      @if (error(); as msg) { <div class="err" role="alert">{{ msg }}</div> }
      @switch (state()) {
        @case ('loading') { <div class="row static muted">Yuklanmoqda…</div> }
        @case ('error') { <div class="row static muted">Manzillar yuklanmadi. <button type="button" class="link" (click)="load()">Qayta urinish</button></div> }
        @case ('ready') {
          @for (a of addresses(); track a.id) {
            <div class="row static item">
              <div class="info">
                <div><b>{{ a.title || 'Manzil' }}</b> @if (a.is_default) { <span class="default">Asosiy</span> }</div>
                <div class="muted">{{ a.address }}</div>
              </div>
              <div class="acts">
                @if (!a.is_default) { <button type="button" (click)="makeDefault(a)">Asosiy qilish</button> }
                <button type="button" class="danger" (click)="remove(a)">O'chirish</button>
              </div>
            </div>
          } @empty {
            @if (!adding()) { <div class="row static muted">Hali manzil yo'q</div> }
          }
        }
      }
      @if (adding()) {
        <div class="editor">
          <input #t [value]="titleDraft()" (input)="titleDraft.set(t.value)" maxlength="50" placeholder="Nomi (Uy, Ish…)" aria-label="Manzil nomi" />
          <input #a [value]="addressDraft()" (input)="addressDraft.set(a.value)" maxlength="500" placeholder="Ko'cha, uy, podyezd, kvartira" aria-label="Manzil" />
          <button type="button" class="geo" (click)="locate()">📍 Joylashuvni aniqlash</button>
          @if (geoMsg(); as msg) { <small class="muted" role="status">{{ msg }}</small> }
          <div class="actions">
            <button type="button" class="primary" [disabled]="saving()" (click)="save()">Saqlash</button>
            <button type="button" (click)="adding.set(false)">Bekor</button>
          </div>
        </div>
      }
    </section>
  `,
  styles: [`
    .rows { margin: 0 1rem .75rem; background: #fff; border: 1px solid #eee; border-radius: 14px; overflow: hidden; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .9rem 1rem; border-bottom: 1px solid #f0f0f0; }
    .rows > :last-child { border-bottom: none; }
    .item { align-items: flex-start; }
    .info { min-width: 0; }
    .muted { color: #6b6b6b; font-size: .9rem; }
    .default { font-size: .7rem; background: #fff4ec; color: #a34700; border-radius: 999px; padding: .1rem .5rem; margin-left: .4rem; }
    .acts { display: flex; flex-direction: column; gap: .35rem; align-items: flex-end; }
    .acts button, .add, .link { border: none; background: none; color: #F60; font: inherit; font-size: .85rem; cursor: pointer; padding: 0; }
    .acts .danger { color: #b42318; }
    .err { padding: .5rem 1rem; color: #b42318; font-size: .85rem; }
    .editor { padding: .5rem 1rem 1rem; background: #fafafa; display: grid; gap: .5rem; }
    .editor input { width: 100%; border: none; border-radius: 14px; background: #f3f3f3; padding: .85rem; font: inherit; }
    .editor input:focus-visible { outline: 2px solid #F60; outline-offset: 2px; }
    .geo { justify-self: start; border: none; background: #ededed; border-radius: 999px; padding: .5rem .9rem; font: inherit; cursor: pointer; }
    .actions { display: flex; gap: .5rem; }
    .actions button { border: none; border-radius: 999px; padding: .5rem 1rem; font: inherit; cursor: pointer; background: #ededed; }
    .actions .primary { background: #F60; color: #fff; font-weight: 700; }
  `],
})
export class AddressBook {
  private api = inject(AddressesApi);
  private city = inject(CityService);

  addresses = signal<Address[]>([]);
  state = signal<State>('loading');
  error = signal<string | null>(null);
  adding = signal(false);
  saving = signal(false);
  titleDraft = signal('');
  addressDraft = signal('');
  geo = signal<{ lat: number; lng: number } | null>(null);
  geoMsg = signal<string | null>(null);

  constructor() { this.load(); }

  load(): void {
    this.state.set('loading');
    this.api.list().subscribe({
      next: (list) => { this.addresses.set(list); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  startAdd(): void {
    this.titleDraft.set(''); this.addressDraft.set(''); this.geo.set(null); this.geoMsg.set(null); this.error.set(null);
    this.adding.set(true);
  }

  locate(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { this.geoMsg.set('Joylashuv aniqlanmadi'); return; }
    this.geoMsg.set('Aniqlanmoqda…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { this.geo.set({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) }); this.geoMsg.set('Joylashuv aniqlandi ✓'); },
      () => this.geoMsg.set('Joylashuv aniqlanmadi'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  save(): void {
    const address = this.addressDraft().trim();
    const cityId = this.city.cityId;
    if (address.length < 5) { this.error.set('Manzil juda qisqa'); return; }
    if (cityId === null) { this.error.set('Shahar tanlanmagan'); return; }
    const geo = this.geo();
    this.saving.set(true); this.error.set(null);
    this.api.create({
      city: cityId, title: this.titleDraft().trim(), address,
      ...(geo ? { latitude: geo.lat, longitude: geo.lng } : {}),
      is_default: this.addresses().length === 0,
    }).subscribe({
      next: (created) => { this.addresses.update((l) => [created, ...l]); this.adding.set(false); this.saving.set(false); },
      error: () => { this.error.set(SAVE_FAILED); this.saving.set(false); },
    });
  }

  makeDefault(a: Address): void {
    this.error.set(null);
    // The backend clears the other defaults; reload to get the authoritative flags.
    this.api.update(a.id, { is_default: true }).subscribe({ next: () => this.load(), error: () => this.error.set(SAVE_FAILED) });
  }

  remove(a: Address): void {
    this.error.set(null);
    this.api.remove(a.id).subscribe({
      next: () => this.addresses.update((l) => l.filter((x) => x.id !== a.id)),
      error: () => this.error.set(SAVE_FAILED),
    });
  }
}

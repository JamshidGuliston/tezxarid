import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Profile } from './profile';
import { AuthService } from '../../core/auth/auth.service';
import { TokenStore } from '../../core/auth/token.store';
import { CartStore } from '../../core/cart/cart.store';
import { CityService } from '../../core/city/city.service';
import { CustomerStore } from '../../core/customer/customer.store';

// 12:00 UTC — the same calendar day in every zone from UTC-11 to UTC+11, so this fixture is timezone-robust.
const ME = { id: 7, telegram_id: 7, first_name: 'Aziz', last_name: 'Karimov', phone: '+998901234567',
  city: 1, date_joined: '2026-09-20T17:00:00+05:00' };

describe('Profile', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Profile], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const city = TestBed.inject(CityService);
    city.cities.set([{ id: 1, name: 'Guliston', slug: 'guliston' }, { id: 2, name: 'Samarqand', slug: 'samarqand' }]);
    city.setCity({ id: 1, name: 'Guliston', slug: 'guliston' });
  });

  afterEach(() => vi.restoreAllMocks());

  async function create() {
    const fixture = TestBed.createComponent(Profile);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  const text = (f: { nativeElement: HTMLElement }) => f.nativeElement.textContent as string;

  it('shows guest placeholders and saves name and phone to the device', async () => {
    const fixture = await create();
    expect(text(fixture)).toContain('Ism kiritilmagan');
    expect(text(fixture)).toContain('Telefon kiritilmagan');
    expect(text(fixture)).not.toContain("Ro'yxatdan o'tgan");
    const c = fixture.componentInstance;
    c.edit('name'); c.nameDraft.set('Aziz Karimov'); await c.saveName();
    c.edit('phone'); c.phoneCtrl.setValue('+998901234567'); await c.savePhone();
    const info = TestBed.inject(CustomerStore).info();
    expect(info.name).toBe('Aziz Karimov');
    expect(info.phone).toBe('+998901234567');
    fixture.detectChanges();
    expect(text(fixture)).toContain('AK'); // avatar initials
    http.expectNone((r) => r.url.endsWith('/auth/me/'));
  });

  it('patches the server when signed in and shows the joined date', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    TestBed.inject(AuthService).me.set(ME);
    const fixture = await create();
    http.expectOne((r) => r.url.endsWith('/addresses/')).flush([]); // mounted AddressBook's list request
    expect(text(fixture)).toContain('Aziz Karimov');
    expect(text(fixture)).toContain('20-sentabr, 2026');
    const c = fixture.componentInstance;
    c.edit('name'); c.nameDraft.set('Anvar Aliyev');
    const done = c.saveName();
    const req = http.expectOne((r) => r.url.endsWith('/auth/me/') && r.method === 'PATCH');
    expect(req.request.body).toEqual({ first_name: 'Anvar', last_name: 'Aliyev' });
    req.flush({ ...ME, first_name: 'Anvar', last_name: 'Aliyev' });
    await done;
    fixture.detectChanges();
    expect(text(fixture)).toContain('Anvar Aliyev');
    expect(c.editing()).toBeNull();
  });

  it('switching city asks before clearing a non-empty cart, then switches and goes home', async () => {
    TestBed.inject(CartStore).add({ id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
      step: '1', category: 1, price: '19300.00', is_available: true, stock: 0 });
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fixture = await create();
    const c = fixture.componentInstance;
    c.edit('city'); c.cityDraft.set(2);
    await c.saveCity();
    expect(TestBed.inject(CityService).cityId).toBe(1);   // declined
    expect(TestBed.inject(CartStore).count()).toBe(1);
    confirm.mockReturnValue(true);
    await c.saveCity();
    expect(TestBed.inject(CityService).cityId).toBe(2);
    expect(TestBed.inject(CartStore).count()).toBe(0);
    expect(nav).toHaveBeenCalledWith('/');
  });

  it('hides support and offer rows while the URLs are not configured', async () => {
    const fixture = await create();
    expect(text(fixture)).not.toContain("Qo'llab-quvvatlash");
    expect(text(fixture)).not.toContain('Ommaviy oferta');
    expect(fixture.nativeElement.querySelector('button.tg-phone')).toBeNull(); // not inside Telegram
  });

  it('preselects the active city in the select', async () => {
    const fixture = await create();
    TestBed.inject(CityService).setCity({ id: 2, name: 'Samarqand', slug: 'samarqand' });
    const c = fixture.componentInstance;
    c.edit('city');
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('2');
    expect(select.selectedIndex).toBe(1);
  });

  it('shows a save-failed banner and keeps the editor open when saving the name fails', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    TestBed.inject(AuthService).me.set(ME);
    const fixture = await create();
    http.expectOne((r) => r.url.endsWith('/addresses/')).flush([]); // mounted AddressBook's list request
    const c = fixture.componentInstance;
    c.edit('name'); c.nameDraft.set('Anvar Aliyev');
    const done = c.saveName();
    const req = http.expectOne((r) => r.url.endsWith('/auth/me/') && r.method === 'PATCH');
    req.flush('boom', { status: 500, statusText: 'Server Error' });
    await done;
    fixture.detectChanges();
    expect(text(fixture)).toContain('Saqlanmadi');
    expect(c.editing()).toBe('name');
  });

  it("shows a hint when Telegram doesn't provide a phone number", async () => {
    const fixture = await create();
    vi.spyOn(TestBed.inject(AuthService), 'requestPhone').mockResolvedValue(null);
    const c = fixture.componentInstance;
    await c.takePhoneFromTelegram();
    expect(c.phoneHint()).toBe("Telegram telefonni bermadi, qo'lda kiriting");
  });
});

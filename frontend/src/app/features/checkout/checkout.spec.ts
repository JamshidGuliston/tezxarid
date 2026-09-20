import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Checkout } from './checkout';
import { CartStore } from '../../core/cart/cart.store';
import { CityService } from '../../core/city/city.service';
import { CustomerStore } from '../../core/customer/customer.store';
import { OrderStore } from '../../core/orders/order.store';
import { OrderHistoryStore } from '../../core/orders/order-history.store';
import { DeliveryDay, Order } from '../../core/api/models/order.models';
import { TokenStore } from '../../core/auth/token.store';

const DAYS: DeliveryDay[] = [
  { date: '2026-09-12', slots: [{ id: 1, start: '09:00', end: '12:00', available: false }] },
  { date: '2026-09-13', slots: [{ id: 4, start: '16:00', end: '19:00', available: true }] },
];

const ORDER: Order = {
  id: 12, city: 1, customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5',
  latitude: null, longitude: null, comment: '', status: 'new', payment_type: 'cash', total: '19300.00',
  delivery_date: '2026-09-13', delivery_start: '16:00', delivery_end: '19:00', created_at: '', items: [],
};

describe('Checkout', () => {
  let http: HttpTestingController;
  let cart: CartStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Checkout],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), CartStore, CustomerStore, OrderStore],
    });
    http = TestBed.inject(HttpTestingController);
    cart = TestBed.inject(CartStore);
    cart.add({ id: 1, city_product_id: 11, name: 'Olma', image: '', unit: 'kg',
      step: '1', category: 1, price: '19300.00', is_available: true, stock: 0 });
  });

  async function create() {
    const fixture = TestBed.createComponent(Checkout);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/delivery-slots/')).flush(DAYS);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function fillForm(fixture: ComponentFixture<Checkout>) {
    fixture.componentInstance.form.setValue({ name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5', comment: '' });
  }

  it('keeps the submit button disabled until a slot is chosen and the form is valid', async () => {
    const fixture = await create();
    const btn = () => fixture.nativeElement.querySelector('button.submit') as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    expect(btn().textContent).toContain('Yetkazish vaqtini tanlang');

    fixture.componentInstance.selection.set({ date: '2026-09-13', slot: DAYS[1].slots[0] });
    await fixture.whenStable(); fixture.detectChanges();
    expect(btn().disabled).toBe(true);
    expect(btn().textContent).toContain("Ma'lumotlarni to'ldiring");

    fillForm(fixture);
    await fixture.whenStable(); fixture.detectChanges();
    expect(btn().disabled).toBe(false);
    expect(btn().textContent).toContain("19 300 so'm");
  });

  it('posts the order, remembers the customer, clears the cart and navigates to success', async () => {
    const fixture = await create();
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.componentInstance.selection.set({ date: '2026-09-13', slot: DAYS[1].slots[0] });
    fillForm(fixture);
    await fixture.whenStable(); fixture.detectChanges();

    (fixture.nativeElement.querySelector('button.submit') as HTMLButtonElement).click();
    const req = http.expectOne((r) => r.url.endsWith('/orders/') && r.method === 'POST');
    expect(req.request.body).toEqual({
      customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5', comment: '',
      payment_type: 'cash', delivery_date: '2026-09-13', delivery_slot_id: 4,
      items: [{ city_product: 11, qty: '1' }],
    });
    req.flush(ORDER, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    expect(cart.count()).toBe(0);
    expect(TestBed.inject(OrderStore).lastOrder()?.id).toBe(12);
    expect(TestBed.inject(OrderHistoryStore).orders()[0]?.id).toBe(12);
    expect(TestBed.inject(CustomerStore).info().phone).toBe('+998901234567');
    expect(nav).toHaveBeenCalledWith(['/checkout/success']);
  });

  it('shows the items banner and keeps the cart on a 400 items error', async () => {
    const fixture = await create();
    fixture.componentInstance.selection.set({ date: '2026-09-13', slot: DAYS[1].slots[0] });
    fillForm(fixture);
    await fixture.whenStable(); fixture.detectChanges();

    (fixture.nativeElement.querySelector('button.submit') as HTMLButtonElement).click();
    http.expectOne((r) => r.url.endsWith('/orders/'))
      .flush({ items: ['Olma is not available.'] }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable(); fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.banner').textContent).toContain('mavjud emas');
    expect(cart.count()).toBe(1);
    expect((fixture.nativeElement.querySelector('button.submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('reloads slots and clears the selection on a 400 slot error', async () => {
    const fixture = await create();
    fixture.componentInstance.selection.set({ date: '2026-09-13', slot: DAYS[1].slots[0] });
    fillForm(fixture);
    await fixture.whenStable(); fixture.detectChanges();

    (fixture.nativeElement.querySelector('button.submit') as HTMLButtonElement).click();
    http.expectOne((r) => r.url.endsWith('/orders/'))
      .flush({ delivery_slot_id: ['Delivery slot closed for today.'] }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable(); fixture.detectChanges();

    expect(fixture.componentInstance.selection()).toBeNull();
    http.expectOne((r) => r.url.endsWith('/delivery-slots/')).flush(DAYS);
    expect(fixture.nativeElement.querySelector('.banner').textContent).toContain('boshqa vaqtni tanlang');
  });

  it('adds a comment chip once', async () => {
    const fixture = await create();
    fixture.componentInstance.addChip("Qo'ng'iroq qiling");
    fixture.componentInstance.addChip("Qo'ng'iroq qiling");
    fixture.componentInstance.addChip('Eshik oldiga qoldiring');
    expect(fixture.componentInstance.form.controls.comment.value).toBe("Qo'ng'iroq qiling, Eshik oldiga qoldiring");
  });

  const submitBtn = (f: ComponentFixture<Checkout>) => f.nativeElement.querySelector('button.submit') as HTMLButtonElement;
  const bannerText = (f: ComponentFixture<Checkout>) => (f.nativeElement.querySelector('.banner')?.textContent ?? '') as string;

  async function readyToSubmit() {
    const fixture = await create();
    fixture.componentInstance.selection.set({ date: '2026-09-13', slot: DAYS[1].slots[0] });
    fillForm(fixture);
    await fixture.whenStable(); fixture.detectChanges();
    return fixture;
  }

  it('shows a server field error under the field and the fields banner', async () => {
    const fixture = await readyToSubmit();
    submitBtn(fixture).click();
    http.expectOne((r) => r.url.endsWith('/orders/'))
      .flush({ phone: ['Enter a valid phone number.'] }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(bannerText(fixture)).toContain("Ma'lumotlarni tekshiring");
    const errs = Array.from(fixture.nativeElement.querySelectorAll('.err') as NodeListOf<HTMLElement>).map((e) => e.textContent);
    expect(errs.join(' ')).toContain('Enter a valid phone number.');
    expect(submitBtn(fixture).disabled).toBe(true);
  });

  it('shows the network banner and re-enables the button on a 500', async () => {
    const fixture = await readyToSubmit();
    submitBtn(fixture).click();
    http.expectOne((r) => r.url.endsWith('/orders/')).flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(bannerText(fixture)).toContain('Internetni tekshirib');
    expect(submitBtn(fixture).disabled).toBe(false);
    expect(submitBtn(fixture).textContent).toContain("19 300 so'm");
  });

  it('reports an unrecognised 400 as rejected, not as a network problem', async () => {
    const fixture = await readyToSubmit();
    submitBtn(fixture).click();
    http.expectOne((r) => r.url.endsWith('/orders/'))
      .flush({ city: ['X-City-Id header is required.'] }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(bannerText(fixture)).toContain('qabul qilinmadi');
  });

  it('offers a retry when slots fail to load, and reloads on click', async () => {
    const fixture = TestBed.createComponent(Checkout);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/delivery-slots/')).flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.warn').textContent).toContain('yuklanmadi');
    (fixture.nativeElement.querySelector('button.link') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('yuklanmoqda');
    http.expectOne((r) => r.url.endsWith('/delivery-slots/')).flush(DAYS);
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('tx-delivery-picker')).toBeTruthy();
  });

  it('explains when the city has no delivery slots configured', async () => {
    const fixture = TestBed.createComponent(Checkout);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/delivery-slots/')).flush([{ date: '2026-09-12', slots: [] }]);
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('hali sozlanmagan');
    expect(fixture.nativeElement.querySelector('tx-delivery-picker')).toBeNull();
  });

  it("disables submit with \"Savat bo'sh\" when the cart is emptied while on the page", async () => {
    const fixture = await readyToSubmit();
    cart.clear();
    await fixture.whenStable(); fixture.detectChanges();
    expect(submitBtn(fixture).disabled).toBe(true);
    expect(submitBtn(fixture).textContent).toContain("Savat bo'sh");
  });

  it('rounds the geolocation to 6 decimals and sends it with the order', async () => {
    const fixture = await readyToSubmit();
    const geolocation = {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 41.31108123456789, longitude: 69.24056987654321 } } as GeolocationPosition),
    };
    Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true });
    fixture.componentInstance.locate();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.geo()).toEqual({ lat: 41.311081, lng: 69.24057 });
    expect(fixture.nativeElement.textContent).toContain('Joylashuv aniqlandi');
    submitBtn(fixture).click();
    const req = http.expectOne((r) => r.url.endsWith('/orders/') && r.method === 'POST');
    expect(req.request.body.latitude).toBe(41.311081);
    expect(req.request.body.longitude).toBe(69.24057);
    req.flush(ORDER, { status: 201, statusText: 'Created' });
  });

  it('re-enables the page with a notice when navigation to the success page fails', async () => {
    const fixture = await readyToSubmit();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockRejectedValue(new Error('chunk failed'));
    submitBtn(fixture).click();
    http.expectOne((r) => r.url.endsWith('/orders/')).flush(ORDER, { status: 201, statusText: 'Created' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.submitting()).toBe(false);
    expect(bannerText(fixture)).toContain('qabul qilindi');
  });

  it('drops stored coordinates once the address is edited', async () => {
    TestBed.inject(CustomerStore).save({ address: 'Eski manzil 1', latitude: 41.1, longitude: 69.1 });
    const fixture = await create();
    expect(fixture.componentInstance.geo()).toEqual({ lat: 41.1, lng: 69.1 });
    expect(fixture.nativeElement.textContent).toContain('Saqlangan joylashuv');
    fixture.componentInstance.form.controls.address.setValue('Yangi manzil 19');
    expect(fixture.componentInstance.geo()).toBeNull();
  });

  it('keeps a reading taken on this page when the address is typed afterwards', async () => {
    const fixture = await create();
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 41.3, longitude: 69.2 } } as GeolocationPosition) },
      configurable: true,
    });
    fixture.componentInstance.locate();
    fixture.componentInstance.form.controls.address.setValue('Chilonzor 5, 3-podyezd');
    expect(fixture.componentInstance.geo()).toEqual({ lat: 41.3, lng: 69.2 });
  });

  it('offers saved addresses when signed in and preselects the default one', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    TestBed.inject(CityService).setCity({ id: 1, name: 'Guliston', slug: 'guliston' });
    const fixture = TestBed.createComponent(Checkout);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/delivery-slots/')).flush(DAYS);
    http.expectOne((r) => r.url.endsWith('/addresses/')).flush([
      { id: 1, city: 1, title: 'Uy', address: 'Chilonzor 5', latitude: '41.311081', longitude: '69.240562', is_default: true, created_at: '' },
      { id: 2, city: 1, title: 'Ish', address: 'Amir Temur 10', latitude: null, longitude: null, is_default: false, created_at: '' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.form.controls.address.value).toBe('Chilonzor 5');
    expect(c.geo()).toEqual({ lat: 41.311081, lng: 69.240562 });
    const chips = fixture.nativeElement.querySelectorAll('.saved .chip') as NodeListOf<HTMLButtonElement>;
    expect(chips.length).toBe(2);
    chips[1].click();
    await fixture.whenStable();
    expect(c.form.controls.address.value).toBe('Amir Temur 10');
    expect(c.geo()).toBeNull();
  });

  it('does not ask for saved addresses as a guest', async () => {
    await create();
    http.expectNone((r) => r.url.endsWith('/addresses/'));
  });

  it('scopes saved addresses to the active city', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    TestBed.inject(CityService).setCity({ id: 1, name: 'Guliston', slug: 'guliston' });
    const fixture = TestBed.createComponent(Checkout);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/delivery-slots/')).flush(DAYS);
    http.expectOne((r) => r.url.endsWith('/addresses/')).flush([
      { id: 1, city: 1, title: 'Uy', address: 'Chilonzor 5', latitude: null, longitude: null, is_default: true, created_at: '' },
      { id: 2, city: 2, title: 'Boshqa shahar', address: 'Boshqa 1', latitude: null, longitude: null, is_default: true, created_at: '' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.form.controls.address.value).toBe('Chilonzor 5');
    const chips = fixture.nativeElement.querySelectorAll('.saved .chip') as NodeListOf<HTMLButtonElement>;
    expect(chips.length).toBe(1);
  });

  it('drops coordinates from a preselected saved address once the address is edited', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    TestBed.inject(CityService).setCity({ id: 1, name: 'Guliston', slug: 'guliston' });
    const fixture = TestBed.createComponent(Checkout);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/delivery-slots/')).flush(DAYS);
    http.expectOne((r) => r.url.endsWith('/addresses/')).flush([
      { id: 1, city: 1, title: 'Uy', address: 'Chilonzor 5', latitude: '41.311081', longitude: '69.240562', is_default: true, created_at: '' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.geo()).toEqual({ lat: 41.311081, lng: 69.240562 });
    c.form.controls.address.setValue('Chilonzor 5, 3-podyezd');
    expect(c.geo()).toBeNull();
  });

  it('has a group role on the saved-address chips for assistive tech', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    TestBed.inject(CityService).setCity({ id: 1, name: 'Guliston', slug: 'guliston' });
    const fixture = TestBed.createComponent(Checkout);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/delivery-slots/')).flush(DAYS);
    http.expectOne((r) => r.url.endsWith('/addresses/')).flush([
      { id: 1, city: 1, title: 'Uy', address: 'Chilonzor 5', latitude: null, longitude: null, is_default: true, created_at: '' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const group = fixture.nativeElement.querySelector('.chips.saved') as HTMLElement;
    expect(group.getAttribute('role')).toBe('group');
  });
});

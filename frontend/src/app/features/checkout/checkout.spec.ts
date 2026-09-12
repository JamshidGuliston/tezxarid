import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Checkout } from './checkout';
import { CartStore } from '../../core/cart/cart.store';
import { CustomerStore } from '../../core/customer/customer.store';
import { OrderStore } from '../../core/orders/order.store';
import { DeliveryDay, Order } from '../../core/api/models/order.models';

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
});

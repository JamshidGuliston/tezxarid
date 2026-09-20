import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { OrderDetail } from './order-detail';

const STAGES = [
  { id: 1, code: 'new', name: 'Yangi', sort_order: 10, is_initial: true, is_final: false, is_canceled: false },
  { id: 2, code: 'accepted', name: 'Tasdiqlandi', sort_order: 20, is_initial: false, is_final: false, is_canceled: false },
  { id: 3, code: 'canceled', name: 'Bekor qilindi', sort_order: 60, is_initial: false, is_final: false, is_canceled: true },
];
const ORDER = {
  id: 7, city: 1, user: null, customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5',
  latitude: null, longitude: null, comment: '', payment_type: 'cash', total: '19300.00',
  stage: 'new', stage_id: 1, stage_name: 'Yangi', is_terminal: false,
  delivery_date: '2026-09-21', delivery_start: '09:00', delivery_end: '12:00',
  delivery_window: '09:00 – 12:00', delivery_slot: 4,
  created_at: '2026-09-20T10:00:00+05:00', updated_at: '2026-09-20T10:00:00+05:00',
  items: [{ id: 1, city_product: 11, name: 'Olma', unit: 'kg', step: '0.500', qty: '1.000',
            price_snapshot: '19300.00', line_total: '19300.00' }],
  events: [],
};
const DAYS = [{ date: '2026-09-21', slots: [{ id: 4, start: '09:00', end: '12:00', available: true },
                                            { id: 5, start: '16:00', end: '19:00', available: true }] }];

describe('OrderDetail', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [OrderDetail],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } } }],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function create(order = ORDER) {
    const fixture = TestBed.createComponent(OrderDetail);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/operator/orders/7/')).flush(order);
    http.expectOne((r) => r.url.endsWith('/operator/stages/')).flush(STAGES);
    http.expectOne((r) => r.url.endsWith('/delivery-slots/')).flush(DAYS);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows the order with a call link', async () => {
    const fixture = await create();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('№ 7');
    expect(text).toContain('Aziz');
    expect(text).toContain('Olma');
    expect(text).toContain("19 300 so'm");
    const call = fixture.nativeElement.querySelector('a.call') as HTMLAnchorElement;
    expect(call.getAttribute('href')).toBe('tel:+998901234567');
  });

  it('logs a call event when the operator taps the call link', async () => {
    const fixture = await create();
    (fixture.nativeElement.querySelector('a.call') as HTMLAnchorElement).click();
    const req = http.expectOne((r) => r.url.endsWith('/operator/orders/7/events/'));
    expect(req.request.body).toEqual({ kind: 'called', note: '' });
    req.flush({ id: 1, kind: 'called', actor_name: 'op', from_stage_name: '', to_stage_name: '', note: '', created_at: '' });
  });

  it('saves edited customer fields and the delivery slot', async () => {
    const fixture = await create();
    const c = fixture.componentInstance;
    c.form.patchValue({ customer_name: 'Aziz Karimov', comment: 'Eshik oldiga', delivery_slot_id: 5 });
    c.save();
    const req = http.expectOne((r) => r.url.endsWith('/operator/orders/7/') && r.method === 'PATCH');
    expect(req.request.body.customer_name).toBe('Aziz Karimov');
    expect(req.request.body.delivery_slot_id).toBe(5);
    req.flush({ ...ORDER, customer_name: 'Aziz Karimov', comment: 'Eshik oldiga' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Saqlandi');
  });

  it('confirms the order by moving it to the next stage', async () => {
    const fixture = await create();
    (fixture.nativeElement.querySelector('button.confirm') as HTMLButtonElement).click();
    const req = http.expectOne((r) => r.url.endsWith('/operator/orders/7/stage/'));
    expect(req.request.body).toEqual({ stage: 'accepted', note: '' });
    req.flush({ ...ORDER, stage: 'accepted', stage_name: 'Tasdiqlandi', stage_id: 2 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Tasdiqlandi');
  });

  it('asks for a reason before cancelling', async () => {
    const fixture = await create();
    const c = fixture.componentInstance;
    c.cancelling.set(true);
    c.cancelNote.set('');
    c.cancel();
    http.expectNone((r) => r.url.endsWith('/operator/orders/7/stage/'));
    expect(c.error()).toContain('sabab');
    c.cancelNote.set('Mijoz rad etdi');
    c.cancel();
    const req = http.expectOne((r) => r.url.endsWith('/operator/orders/7/stage/'));
    expect(req.request.body).toEqual({ stage: 'canceled', note: 'Mijoz rad etdi' });
    req.flush({ ...ORDER, stage: 'canceled', stage_name: 'Bekor qilindi', is_terminal: true });
  });

  it('locks editing for a closed order', async () => {
    const fixture = await create({ ...ORDER, stage: 'canceled', stage_name: 'Bekor qilindi', is_terminal: true });
    expect(fixture.nativeElement.querySelector('button.confirm')).toBeNull();
    expect(fixture.componentInstance.form.disabled).toBe(true);
  });

  it('sends replaced items to the server', async () => {
    const fixture = await create();
    fixture.componentInstance.saveItems([{ city_product: 11, qty: '2.000' }]);
    const req = http.expectOne((r) => r.url.endsWith('/operator/orders/7/items/') && r.method === 'PUT');
    expect(req.request.body).toEqual({ items: [{ city_product: 11, qty: '2.000' }] });
    req.flush({ ...ORDER, total: '38600.00' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("38 600 so'm");
  });
});

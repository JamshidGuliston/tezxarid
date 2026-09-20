import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { CustomerDetail } from './customer-detail';

const ORDER = {
  id: 7, city: 1, user: 3, customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5',
  latitude: null, longitude: null, comment: '', payment_type: 'cash', total: '19300.00',
  stage: 'done', stage_id: 5, stage_name: 'Yetkazildi', is_terminal: true,
  delivery_date: '2026-09-21', delivery_start: '09:00', delivery_end: '12:00',
  delivery_window: '09:00 – 12:00', delivery_slot: 4, created_at: '2026-09-20T10:00:00+05:00',
  updated_at: '2026-09-20T10:00:00+05:00',
  items: [{ id: 1, city_product: 11, name: 'Olma', unit: 'kg', step: '0.500', qty: '1.000',
            price_snapshot: '19300.00', line_total: '19300.00' }],
  events: [],
};
const CUSTOMER = { id: 3, name: 'Aziz Karimov', username: 'tg_1', phone: '+998901234567', telegram_id: 1,
  date_joined: '2026-09-01T10:00:00+05:00', orders_count: 1, orders_total: '19300.00',
  last_order_at: '2026-09-20T10:00:00+05:00',
  addresses: [{ id: 1, title: 'Uy', address: 'Chilonzor 5', is_default: true }],
  orders: [ORDER] };

describe('CustomerDetail', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CustomerDetail],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '3' }) } } }],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('shows the profile, the saved addresses and every order with its items', async () => {
    const fixture = TestBed.createComponent(CustomerDetail);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/operator/customers/3/')).flush(CUSTOMER);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Aziz Karimov');
    expect(text).toContain('Uy');
    expect(text).toContain('№ 7');
    expect(text).toContain('Yetkazildi');
    (fixture.nativeElement.querySelector('button.toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Olma');
  });
});

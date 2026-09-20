import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Orders } from './orders';
import { TokenStore } from '../../core/auth/token.store';
import { OrderHistoryStore } from '../../core/orders/order-history.store';
import { Order } from '../../core/api/models/order.models';

const order = (id: number, status: string): Order => ({
  id, city: 1, customer_name: 'A', phone: '+998901234567', address: 'X', latitude: null, longitude: null,
  comment: '', status, payment_type: 'cash', total: '1000.00', delivery_date: '2026-09-20',
  delivery_start: '09:00', delivery_end: '12:00', created_at: '', items: [],
});

describe('Orders', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Orders], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('shows device history for guests without calling the server', async () => {
    const history = TestBed.inject(OrderHistoryStore);
    history.add(order(1, 'new'));
    const fixture = TestBed.createComponent(Orders);
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectNone((r) => r.url.endsWith('/orders/'));
    expect(fixture.nativeElement.querySelectorAll('tx-order-card').length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Holat yangilanmaydi');
  });

  it('loads server orders when signed in and splits them into tabs', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    const fixture = TestBed.createComponent(Orders);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/orders/')).flush([order(3, 'done'), order(2, 'delivering'), order(1, 'new')]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tx-order-card').length).toBe(2);
    const tabs = fixture.nativeElement.querySelectorAll('.tabs button') as NodeListOf<HTMLButtonElement>;
    tabs[1].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tx-order-card').length).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain('Holat yangilanmaydi');
  });

  it('shows empty states and a retry on failure', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    const fixture = TestBed.createComponent(Orders);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/orders/')).flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('yuklanmadi');
    (fixture.nativeElement.querySelector('button.link') as HTMLButtonElement).click();
    http.expectOne((r) => r.url.endsWith('/orders/')).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Faol buyurtma yo'q");
  });

  it('splits guest orders into Faol and Tarix tabs', async () => {
    const history = TestBed.inject(OrderHistoryStore);
    history.add(order(1, 'new'));
    history.add(order(2, 'done'));
    const fixture = TestBed.createComponent(Orders);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tx-order-card').length).toBe(1);
    const tabs = fixture.nativeElement.querySelectorAll('.tabs button') as NodeListOf<HTMLButtonElement>;
    tabs[1].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tx-order-card').length).toBe(1);
  });

  it("shows Tarix bo'sh for a guest with no orders", async () => {
    const fixture = TestBed.createComponent(Orders);
    await fixture.whenStable();
    fixture.detectChanges();
    const tabs = fixture.nativeElement.querySelectorAll('.tabs button') as NodeListOf<HTMLButtonElement>;
    tabs[1].click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Tarix bo'sh");
  });

  it('re-syncs to guest state when the session is cleared mid-load (failed token refresh)', async () => {
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    const fixture = TestBed.createComponent(Orders);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url.endsWith('/orders/'));
    TestBed.inject(TokenStore).clear();
    req.flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Holat yangilanmaydi');
    expect(fixture.nativeElement.textContent).not.toContain('yuklanmadi');
  });

  it('starts loading automatically after signing in mid-visit', async () => {
    const fixture = TestBed.createComponent(Orders);
    fixture.detectChanges();
    http.expectNone((r) => r.url.endsWith('/orders/'));
    TestBed.inject(TokenStore).set({ access: 'a', refresh: 'r' });
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/orders/')).flush([order(1, 'new')]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tx-order-card').length).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain('Holat yangilanmaydi');
  });
});

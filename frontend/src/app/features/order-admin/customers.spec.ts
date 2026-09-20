import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Customers } from './customers';

const ROW = { id: 3, name: 'Aziz Karimov', username: 'tg_1', phone: '+998901234567', telegram_id: 1,
  date_joined: '2026-09-01T10:00:00+05:00', orders_count: 4, orders_total: '105100.00',
  last_order_at: '2026-09-19T18:00:00+05:00' };

describe('Customers', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [Customers],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => vi.useRealTimers());

  it('lists the city customers with counts and spend', async () => {
    const fixture = TestBed.createComponent(Customers);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/operator/customers/')).flush({ count: 1, results: [ROW] });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Aziz Karimov');
    expect(text).toContain('+998901234567');
    expect(text).toContain('4');
    expect(text).toContain("105 100 so'm");
  });

  it('searches by name or phone', async () => {
    const fixture = TestBed.createComponent(Customers);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/operator/customers/')).flush({ count: 0, results: [] });
    await vi.advanceTimersByTimeAsync(0);
    fixture.componentInstance.query.set('aziz');
    await vi.advanceTimersByTimeAsync(400);
    const req = http.expectOne((r) => r.url.endsWith('/operator/customers/') && r.params.get('q') === 'aziz');
    req.flush({ count: 1, results: [ROW] });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aziz Karimov');
  });
});

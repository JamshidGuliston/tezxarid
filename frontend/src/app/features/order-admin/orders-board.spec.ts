import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { OrdersBoard } from './orders-board';

const STAGES = [
  { id: 1, code: 'new', name: 'Yangi', sort_order: 10, is_initial: true, is_final: false, is_canceled: false },
  { id: 2, code: 'accepted', name: 'Tasdiqlandi', sort_order: 20, is_initial: false, is_final: false, is_canceled: false },
];
const row = (id: number, stage = 'new') => ({
  id, customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5', total: '19300.00',
  stage, stage_name: stage === 'new' ? 'Yangi' : 'Tasdiqlandi', delivery_date: '2026-09-21',
  delivery_window: '09:00 – 12:00', items_count: 2, created_at: '2026-09-20T10:00:00+05:00', user: null,
});
const page = (rows: ReturnType<typeof row>[]) => ({ count: rows.length, counts: { new: 1, accepted: 0 }, results: rows });

describe('OrdersBoard', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [OrdersBoard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  async function create() {
    const fixture = TestBed.createComponent(OrdersBoard);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/operator/stages/')).flush(STAGES);
    http.expectOne((r) => r.url.endsWith('/operator/orders/')).flush(page([row(7)]));
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    return fixture;
  }

  it('lists the city orders with stage tabs and counters', async () => {
    const fixture = await create();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Yangi');
    expect(text).toContain('№ 7');
    expect(text).toContain('Aziz');
    expect(text).toContain("19 300 so'm");
    expect(fixture.nativeElement.querySelectorAll('.tabs button').length).toBe(3); // Hammasi + two stages
  });

  it('filters by stage through the query', async () => {
    const fixture = await create();
    (fixture.nativeElement.querySelectorAll('.tabs button')[2] as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(0);
    const req = http.expectOne((r) => r.url.endsWith('/operator/orders/') && r.params.get('stage') === 'accepted');
    req.flush(page([]));
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Buyurtma topilmadi');
  });

  it('polls every 15 seconds and alerts on a newly arrived order', async () => {
    const fixture = await create();
    const beep = vi.spyOn(fixture.componentInstance, 'alert').mockImplementation(() => {});
    await vi.advanceTimersByTimeAsync(15_000);
    // interval() + toObservable() under zoneless can emit more than once per tick, queuing
    // duplicate identical requests; match all of them (skipping any switchMap already cancelled)
    // rather than assuming exactly one.
    http.match((r) => r.url.endsWith('/operator/orders/')).filter((r) => !r.cancelled)
      .forEach((r) => r.flush(page([row(9), row(7)])));
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(beep).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('№ 9');
  });

  it('keeps the list when a poll fails', async () => {
    const fixture = await create();
    await vi.advanceTimersByTimeAsync(15_000);
    http.match((r) => r.url.endsWith('/operator/orders/')).filter((r) => !r.cancelled)
      .forEach((r) => r.flush('boom', { status: 500, statusText: 'Server Error' }));
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('№ 7');
    expect(fixture.nativeElement.textContent).toContain('yangilanmadi');
  });
});

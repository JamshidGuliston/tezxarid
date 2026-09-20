import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { OrderItemsEditor } from './order-items-editor';

const ITEMS = [{ id: 1, city_product: 11, name: 'Olma', unit: 'kg', step: '0.500', qty: '1.000',
                 price_snapshot: '19300.00', line_total: '19300.00' }];

describe('OrderItemsEditor', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [OrderItemsEditor],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function create(disabled = false) {
    const fixture = TestBed.createComponent(OrderItemsEditor);
    fixture.componentRef.setInput('items', ITEMS);
    fixture.componentRef.setInput('disabled', disabled);
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    return fixture;
  }

  it('steps a line up and down and keeps the running total', async () => {
    const fixture = await create();
    const c = fixture.componentInstance;
    c.step(0, 1);
    expect(c.lines()[0].qty).toBe('1.500');
    expect(c.total()).toBe(28950);
    c.step(0, -1);
    c.step(0, -1);
    expect(c.lines()[0].qty).toBe('0.500');
    c.step(0, -1);
    expect(c.lines().length).toBe(0);         // stepping below one step removes the line
  });

  it('adds a searched product and emits the payload on save', async () => {
    const fixture = await create();
    const c = fixture.componentInstance;
    const emitted: { city_product: number; qty: string }[][] = [];
    c.save.subscribe((payload) => emitted.push(payload));
    c.search.set('non');
    await vi.advanceTimersByTimeAsync(400);
    http.expectOne((r) => r.url.endsWith('/operator/products/') && r.params.get('search') === 'non')
      .flush([{ city_product_id: 12, name: 'Non', unit: 'sht', step: '1.000', price: '3000.00' }]);
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    c.add({ city_product_id: 12, name: 'Non', unit: 'sht', step: '1.000', price: '3000.00' });
    expect(c.lines().length).toBe(2);
    c.emit();
    expect(emitted[0]).toEqual([{ city_product: 11, qty: '1.000' }, { city_product: 12, qty: '1.000' }]);
  });

  it('hides the controls for a closed order', async () => {
    const fixture = await create(true);
    expect(fixture.nativeElement.querySelector('button.plus')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[type="search"]')).toBeNull();
  });
});

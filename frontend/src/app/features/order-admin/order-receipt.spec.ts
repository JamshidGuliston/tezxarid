import { TestBed } from '@angular/core/testing';
import { OrderReceipt } from './order-receipt';

const ORDER = {
  id: 7, city: 1, user: null, customer_name: 'Aziz Karimov', phone: '+998901234567',
  address: 'Chilonzor 5, 3-podyezd', latitude: null, longitude: null, comment: "Qo'ng'iroq qiling",
  payment_type: 'cash', total: '105100.00', stage: 'accepted', stage_id: 2, stage_name: 'Tasdiqlandi',
  is_terminal: false, delivery_date: '2026-09-21', delivery_start: '16:00', delivery_end: '19:00',
  delivery_window: '16:00 – 19:00', delivery_slot: 5,
  created_at: '2026-09-20T14:05:00+05:00', updated_at: '2026-09-20T14:05:00+05:00',
  items: [
    { id: 1, city_product: 11, name: 'Olma', unit: 'kg', step: '0.500', qty: '2.000', price_snapshot: '19300.00', line_total: '38600.00' },
    { id: 2, city_product: 12, name: 'Non', unit: 'sht', step: '1.000', qty: '3.000', price_snapshot: '3000.00', line_total: '9000.00' },
  ],
  events: [],
};

describe('OrderReceipt', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [OrderReceipt] }));

  it('prints the shop line, the order, every item and the totals', async () => {
    const fixture = TestBed.createComponent(OrderReceipt);
    fixture.componentRef.setInput('order', ORDER);
    fixture.componentRef.setInput('cityName', 'Guliston');
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
    expect(text).toContain('TEZXARID');
    expect(text).toContain('Guliston');
    expect(text).toContain('№ 7');
    expect(text).toContain('21.09.2026');
    expect(text).toContain('16:00 – 19:00');
    expect(text).toContain('Olma');
    expect(text).toContain('2 kg');
    expect(text).toContain("38 600 so'm");
    expect(text).toContain("105 100 so'm");
    expect(text).toContain('Naqd');
    expect(text).toContain('Aziz Karimov');
    expect(text).toContain('Chilonzor 5, 3-podyezd');
    expect(text).toContain("Qo'ng'iroq qiling");
    expect(fixture.nativeElement.querySelector('.receipt')).toBeTruthy();
  });
});

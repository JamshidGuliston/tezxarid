import { TestBed } from '@angular/core/testing';
import { DeliveryPicker } from './delivery-picker';
import { DeliveryDay } from '../../../core/api/models/order.models';

const DAYS: DeliveryDay[] = [
  { date: '2026-09-12', slots: [{ id: 1, start: '09:00', end: '12:00', available: false }] },
  { date: '2026-09-13', slots: [
    { id: 2, start: '09:00', end: '12:00', available: false },
    { id: 3, start: '16:00', end: '19:00', available: true },
  ] },
];
const BOTH_OPEN: DeliveryDay[] = [
  { date: '2026-09-12', slots: [{ id: 1, start: '09:00', end: '12:00', available: true }] },
  { date: '2026-09-13', slots: [{ id: 3, start: '16:00', end: '19:00', available: true }] },
];

describe('DeliveryPicker', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [DeliveryPicker] }));

  async function create(days: DeliveryDay[] = DAYS) {
    const fixture = TestBed.createComponent(DeliveryPicker);
    fixture.componentRef.setInput('days', days);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  const dayBtns = (f: { nativeElement: HTMLElement }) => f.nativeElement.querySelectorAll('button.day') as NodeListOf<HTMLButtonElement>;
  const slotBtns = (f: { nativeElement: HTMLElement }) => f.nativeElement.querySelectorAll('button.slot') as NodeListOf<HTMLButtonElement>;

  it('defaults to the first day that has an open slot and disables fully closed days', async () => {
    const fixture = await create();
    expect(fixture.componentInstance.activeDate()).toBe('2026-09-13');
    expect(dayBtns(fixture).length).toBe(2);
    expect(dayBtns(fixture)[0].disabled).toBe(true);
    expect(dayBtns(fixture)[1].classList.contains('active')).toBe(true);
    expect(dayBtns(fixture)[1].getAttribute('aria-pressed')).toBe('true');
  });

  it("labels the first day Bugun and the others by weekday", async () => {
    const fixture = await create();
    expect(dayBtns(fixture)[0].textContent).toContain('Bugun');
    expect(dayBtns(fixture)[1].textContent).toContain('Ya'); // 2026-09-13 is a Sunday
  });

  it('disables unavailable slots and emits the selection when an open one is clicked', async () => {
    const fixture = await create();
    expect(slotBtns(fixture).length).toBe(2);
    expect(slotBtns(fixture)[0].disabled).toBe(true);
    expect(slotBtns(fixture)[1].disabled).toBe(false);
    slotBtns(fixture)[1].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.selection()).toEqual({
      date: '2026-09-13', slot: { id: 3, start: '16:00', end: '19:00', available: true },
    });
    expect(slotBtns(fixture)[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('ignores pickSlot for an unavailable slot', async () => {
    const fixture = await create();
    fixture.componentInstance.pickSlot(DAYS[1].slots[0]);
    expect(fixture.componentInstance.selection()).toBeNull();
  });

  it('switches day on chip click and clears the selection', async () => {
    const fixture = await create(BOTH_OPEN);
    slotBtns(fixture)[0].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selection()?.slot.id).toBe(1);
    dayBtns(fixture)[1].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.activeDate()).toBe('2026-09-13');
    expect(fixture.componentInstance.selection()).toBeNull();
  });

  it('drops a selection whose slot closed after days were reloaded', async () => {
    const fixture = await create(BOTH_OPEN);
    slotBtns(fixture)[0].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selection()?.slot.id).toBe(1);
    fixture.componentRef.setInput('days', DAYS); // slot 1 is now closed
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.activeDate()).toBe('2026-09-13');
    expect(fixture.componentInstance.selection()).toBeNull();
    expect(fixture.nativeElement.querySelector('button.slot.active')).toBeNull();
  });

  it('shows an empty message for a day without slots', async () => {
    const fixture = await create([{ date: '2026-09-12', slots: [] }]);
    expect(fixture.componentInstance.activeDate()).toBe('2026-09-12');
    expect(fixture.nativeElement.textContent).toContain("yetkazish vaqti yo'q");
  });
});

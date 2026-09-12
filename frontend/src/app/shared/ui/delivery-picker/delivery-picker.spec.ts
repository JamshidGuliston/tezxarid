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

describe('DeliveryPicker', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [DeliveryPicker] }));

  async function create() {
    const fixture = TestBed.createComponent(DeliveryPicker);
    fixture.componentRef.setInput('days', DAYS);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('defaults to the first day that has an open slot and disables fully closed days', async () => {
    const fixture = await create();
    expect(fixture.componentInstance.activeDate()).toBe('2026-09-13');
    const dayBtns = fixture.nativeElement.querySelectorAll('button.day') as NodeListOf<HTMLButtonElement>;
    expect(dayBtns.length).toBe(2);
    expect(dayBtns[0].disabled).toBe(true);
    expect(dayBtns[1].classList.contains('active')).toBe(true);
  });

  it('disables unavailable slots and emits the selection when an open one is clicked', async () => {
    const fixture = await create();
    const slotBtns = fixture.nativeElement.querySelectorAll('button.slot') as NodeListOf<HTMLButtonElement>;
    expect(slotBtns.length).toBe(2);
    expect(slotBtns[0].disabled).toBe(true);
    expect(slotBtns[1].disabled).toBe(false);
    slotBtns[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selection()).toEqual({
      date: '2026-09-13', slot: { id: 3, start: '16:00', end: '19:00', available: true },
    });
  });

  it('clears the selection when the day changes', async () => {
    const fixture = await create();
    fixture.componentInstance.selection.set({ date: '2026-09-13', slot: DAYS[1].slots[1] });
    fixture.componentInstance.pickDay('2026-09-12');
    expect(fixture.componentInstance.selection()).toBeNull();
    expect(fixture.componentInstance.activeDate()).toBe('2026-09-12');
  });
});

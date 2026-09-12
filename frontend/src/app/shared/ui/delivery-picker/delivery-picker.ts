import { Component, computed, effect, input, linkedSignal, model, untracked } from '@angular/core';
import { DeliveryDay, DeliverySelection, DeliverySlot } from '../../../core/api/models/order.models';
import { dayNumber, formatDayMonth, weekdayShort } from '../../utils/dates';

@Component({
  selector: 'tx-delivery-picker',
  standalone: true,
  template: `
    <section class="block">
      <h3 id="dp-day-title">Yetkazish kuni</h3>
      <div class="days" role="group" aria-labelledby="dp-day-title">
        @for (d of days(); track d.date) {
          <button type="button" class="day"
            [class.active]="d.date === activeDate()"
            [attr.aria-pressed]="d.date === activeDate()"
            [attr.aria-label]="dayFull(d.date)"
            [disabled]="!hasOpenSlot(d)"
            (click)="pickDay(d.date)">
            <small>{{ dayLabel(d.date) }}</small>
            <b>{{ dayNum(d.date) }}</b>
          </button>
        }
      </div>
    </section>
    <section class="block">
      <h3 id="dp-slot-title">Yetkazish vaqti</h3>
      <div class="slots" role="group" aria-labelledby="dp-slot-title">
        @for (s of activeSlots(); track s.id) {
          <button type="button" class="slot"
            [class.active]="activeSlotId() === s.id"
            [attr.aria-pressed]="activeSlotId() === s.id"
            [disabled]="!s.available"
            (click)="pickSlot(s)">{{ s.start }} – {{ s.end }}</button>
        } @empty {
          <p class="empty">Bu kunda yetkazish vaqti yo'q</p>
        }
      </div>
    </section>
  `,
  styles: [`
    .block { padding: .75rem 1rem 0; }
    h3 { margin: 0 0 .5rem; font-size: 1rem; }
    .days { display: flex; gap: .5rem; overflow-x: auto; padding-bottom: .5rem; scrollbar-width: thin; }
    .day { flex: 0 0 4.25rem; display: flex; flex-direction: column; align-items: center; gap: .15rem;
      padding: .6rem 0; border: 2px solid transparent; border-radius: 14px; background: #f3f3f3; cursor: pointer; }
    .day small { color: #666; font-size: .75rem; }
    .day b { font-size: 1.1rem; }
    .day.active { border-color: #F60; background: #fff4ec; }
    .day:disabled { opacity: .55; cursor: default; text-decoration: line-through; }
    .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: .5rem; }
    .slot { padding: .9rem .5rem; border: 2px solid transparent; border-radius: 14px; background: #f3f3f3;
      font-weight: 600; cursor: pointer; }
    .slot.active { border-color: #F60; background: #fff4ec; }
    .slot:disabled { opacity: .55; cursor: default; text-decoration: line-through; }
    .empty { color: #9a9a9a; margin: .25rem 0; }
  `],
})
export class DeliveryPicker {
  days = input.required<DeliveryDay[]>();
  /** Two-way bound: `[(selection)]="selection"` in the parent. The picker clears it itself
   *  whenever it no longer points at an open slot of the active day (day change, days reload). */
  selection = model<DeliverySelection | null>(null);

  /** Defaults to the first day with an open slot; user clicks override it until `days` changes. */
  activeDate = linkedSignal<string | null>(
    () => this.days().find((d) => this.hasOpenSlot(d))?.date ?? this.days()[0]?.date ?? null,
  );
  activeSlots = computed(() => this.days().find((d) => d.date === this.activeDate())?.slots ?? []);

  /** The selected slot id, but only while it is still an open slot of the active day. */
  activeSlotId = computed(() => {
    const sel = this.selection();
    if (!sel || sel.date !== this.activeDate()) return null;
    return this.activeSlots().some((s) => s.id === sel.slot.id && s.available) ? sel.slot.id : null;
  });

  constructor() {
    // Drop a stale selection (e.g. the slot closed after `days` was reloaded) so the parent
    // never submits a slot the picker isn't showing as selected.
    effect(() => {
      if (this.activeSlotId() === null && untracked(() => this.selection()) !== null) {
        this.selection.set(null);
      }
    });
  }

  hasOpenSlot(d: DeliveryDay): boolean {
    return d.slots.some((s) => s.available);
  }

  /** The server builds `days` from its own "today", so the first entry is today. */
  dayLabel(date: string): string {
    return date === this.days()[0]?.date ? 'Bugun' : weekdayShort(date);
  }

  dayFull(date: string): string {
    return formatDayMonth(date);
  }

  dayNum(date: string): number {
    return dayNumber(date);
  }

  pickDay(date: string): void {
    this.activeDate.set(date);
    this.selection.set(null);
  }

  pickSlot(slot: DeliverySlot): void {
    const date = this.activeDate();
    if (date && slot.available) this.selection.set({ date, slot });
  }
}

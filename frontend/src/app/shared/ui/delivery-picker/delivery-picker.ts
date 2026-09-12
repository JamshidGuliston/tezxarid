import { Component, computed, input, linkedSignal, model } from '@angular/core';
import { DeliveryDay, DeliverySelection, DeliverySlot } from '../../../core/api/models/order.models';
import { dayNumber, todayIso, weekdayShort } from '../../utils/dates';

@Component({
  selector: 'tx-delivery-picker',
  standalone: true,
  template: `
    <section class="block">
      <h3>Yetkazish kuni</h3>
      <div class="days">
        @for (d of days(); track d.date) {
          <button type="button" class="day"
            [class.active]="d.date === activeDate()"
            [disabled]="!hasOpenSlot(d)"
            (click)="pickDay(d.date)">
            <small>{{ dayLabel(d.date) }}</small>
            <b>{{ dayNum(d.date) }}</b>
          </button>
        }
      </div>
    </section>
    <section class="block">
      <h3>Yetkazish vaqti</h3>
      <div class="slots">
        @for (s of activeSlots(); track s.id) {
          <button type="button" class="slot"
            [class.active]="selection()?.slot?.id === s.id"
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
    .day small { color: #777; font-size: .75rem; }
    .day b { font-size: 1.1rem; }
    .day.active { border-color: #F60; background: #fff4ec; }
    .day:disabled { opacity: .4; cursor: default; }
    .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: .5rem; }
    .slot { padding: .9rem .5rem; border: 2px solid transparent; border-radius: 14px; background: #f3f3f3;
      font-weight: 600; cursor: pointer; }
    .slot.active { border-color: #F60; background: #fff4ec; }
    .slot:disabled { opacity: .4; cursor: default; text-decoration: line-through; }
    .empty { color: #9a9a9a; margin: .25rem 0; }
  `],
})
export class DeliveryPicker {
  days = input.required<DeliveryDay[]>();
  /** Two-way bound: `[(selection)]="selection"` in the parent. */
  selection = model<DeliverySelection | null>(null);

  /** Defaults to the first day with an open slot; user clicks override it until `days` changes. */
  activeDate = linkedSignal<string | null>(
    () => this.days().find((d) => this.hasOpenSlot(d))?.date ?? this.days()[0]?.date ?? null,
  );
  activeSlots = computed(() => this.days().find((d) => d.date === this.activeDate())?.slots ?? []);

  hasOpenSlot(d: DeliveryDay): boolean {
    return d.slots.some((s) => s.available);
  }

  dayLabel(date: string): string {
    return date === todayIso() ? 'Bugun' : weekdayShort(date);
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

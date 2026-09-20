import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { OperatorApi } from '../../core/api/operator-api';
import { OperatorOrderItem, OperatorProduct } from '../../core/api/models/operator.models';
import { SumPipe } from '../../shared/pipes/sum.pipe';

export interface EditorLine {
  city_product: number;
  name: string;
  unit: string;
  step: string;
  qty: string;
  price: string;
}

const dec = (value: string) => Number(value);
const fixed = (value: number) => value.toFixed(3);

/** Edits an order's lines: step a quantity, drop a line, or add a product found by name. */
@Component({
  selector: 'tx-order-items-editor',
  standalone: true,
  imports: [SumPipe],
  template: `
    <ul class="lines">
      @for (line of lines(); track line.city_product; let i = $index) {
        <li>
          <div class="name"><b>{{ line.name }}</b><small>{{ line.price | sum }} / {{ line.unit }}</small></div>
          @if (!disabled()) {
            <div class="qty">
              <button type="button" class="minus" (click)="step(i, -1)" aria-label="Kamaytirish">−</button>
              <span>{{ line.qty }} {{ line.unit }}</span>
              <button type="button" class="plus" (click)="step(i, 1)" aria-label="Ko'paytirish">+</button>
            </div>
          } @else {
            <div class="qty"><span>{{ line.qty }} {{ line.unit }}</span></div>
          }
          <div class="sum">{{ lineTotal(line) | sum }}</div>
        </li>
      } @empty { <li class="muted">Mahsulot yo'q</li> }
    </ul>

    <div class="total"><span>Jami</span><b>{{ String(total()) | sum }}</b></div>

    @if (!disabled()) {
      <div class="adder">
        <input #box type="search" placeholder="Mahsulot qidirish" aria-label="Mahsulot qidirish"
          [value]="search()" (input)="search.set(box.value)" />
        @if (found().length) {
          <ul class="found">
            @for (p of found(); track p.city_product_id) {
              <li><button type="button" (click)="add(p); search.set(''); box.value = ''">{{ p.name }} · {{ p.price | sum }}</button></li>
            }
          </ul>
        }
      </div>
      <button type="button" class="save" [disabled]="!dirty()" (click)="emit()">Mahsulotlarni saqlash</button>
    }
  `,
  styles: [`
    .lines { list-style: none; margin: 0; padding: 0; }
    .lines li { display: grid; grid-template-columns: 1fr auto 6rem; gap: .75rem; align-items: center;
      padding: .4rem 0; border-bottom: 1px solid #f2f2f2; }
    .name small { display: block; color: #6b6b6b; font-size: .78rem; }
    .qty { display: flex; align-items: center; gap: .5rem; }
    .qty button { width: 2rem; height: 2rem; border: none; border-radius: 50%; background: #f0f0f0; font: inherit; cursor: pointer; }
    .sum { text-align: right; font-weight: 700; }
    .total { display: flex; justify-content: space-between; padding: .5rem 0; font-size: 1.05rem; }
    .adder { position: relative; margin-top: .5rem; }
    .adder input { width: 100%; border: none; border-radius: 10px; background: #f3f3f3; padding: .6rem; font: inherit; }
    .found { list-style: none; margin: .25rem 0 0; padding: 0; background: #fff; border: 1px solid #eee; border-radius: 10px; }
    .found button { width: 100%; text-align: left; border: none; background: none; padding: .5rem .75rem; font: inherit; cursor: pointer; }
    .save { margin-top: .6rem; border: none; border-radius: 12px; background: #F60; color: #fff; font: inherit;
      font-weight: 700; padding: .6rem 1.1rem; cursor: pointer; }
    .save:disabled { background: #e6e6e6; color: #6b6b6b; cursor: default; }
    .muted { color: #767676; padding: .5rem 0; }
  `],
})
export class OrderItemsEditor {
  private api = inject(OperatorApi);

  items = input.required<OperatorOrderItem[]>();
  disabled = input(false);
  save = output<{ city_product: number; qty: string }[]>();

  lines = signal<EditorLine[]>([]);
  search = signal('');
  found = signal<OperatorProduct[]>([]);
  dirty = signal(false);
  protected readonly String = String;

  total = computed(() => this.lines().reduce((sum, l) => sum + dec(l.qty) * dec(l.price), 0));

  constructor() {
    effect(() => {
      // Reset the working copy whenever the server sends a fresh order.
      const source = this.items();
      this.lines.set(source.map((i) => ({
        city_product: i.city_product, name: i.name, unit: i.unit, step: i.step,
        qty: i.qty, price: i.price_snapshot,
      })));
      this.dirty.set(false);
    });

    toObservable(this.search).pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((term) => term.trim().length < 2
        ? of([] as OperatorProduct[])
        : this.api.products(term.trim()).pipe(catchError(() => of([] as OperatorProduct[])))),
      takeUntilDestroyed(),
    ).subscribe((list) => this.found.set(list));
  }

  lineTotal(line: EditorLine): string {
    return (dec(line.qty) * dec(line.price)).toFixed(2);
  }

  step(index: number, direction: 1 | -1): void {
    this.lines.update((list) => {
      const line = list[index];
      if (!line) return list;
      const next = dec(line.qty) + direction * dec(line.step);
      if (next < dec(line.step)) return list.filter((_, i) => i !== index);
      return list.map((l, i) => (i === index ? { ...l, qty: fixed(next) } : l));
    });
    this.dirty.set(true);
  }

  add(product: OperatorProduct): void {
    this.lines.update((list) => {
      const existing = list.findIndex((l) => l.city_product === product.city_product_id);
      if (existing >= 0) {
        return list.map((l, i) => (i === existing ? { ...l, qty: fixed(dec(l.qty) + dec(l.step)) } : l));
      }
      return [...list, { city_product: product.city_product_id, name: product.name, unit: product.unit,
                         step: product.step, qty: fixed(dec(product.step)), price: product.price }];
    });
    this.found.set([]);
    this.dirty.set(true);
  }

  emit(): void {
    this.save.emit(this.lines().map((l) => ({ city_product: l.city_product, qty: l.qty })));
  }
}

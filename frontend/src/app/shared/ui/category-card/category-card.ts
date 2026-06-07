import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Category } from '../../../core/api/models/catalog.models';

@Component({
  selector: 'tx-category-card',
  standalone: true,
  imports: [RouterLink],
  template: `
    <a class="cat" [routerLink]="['/category', category().id]" [style.backgroundImage]="bg()">
      <span class="name">{{ category().name }}</span>
      <span class="chev">›</span>
    </a>
  `,
  styles: [`
    .cat { position: relative; display: flex; align-items: flex-end; justify-content: space-between;
      min-height: 120px; padding: 1rem; border-radius: 16px; color: #fff; text-decoration: none;
      background: #cfcfcf center/cover no-repeat; overflow: hidden; }
    .cat::before { content: ''; position: absolute; inset: 0;
      background: linear-gradient(transparent, rgba(0,0,0,.45)); }
    .name, .chev { position: relative; z-index: 1; font-weight: 700; font-size: 1.25rem; }
    .chev { background: rgba(255,255,255,.25); border-radius: 50%; width: 2rem; height: 2rem;
      display: grid; place-items: center; }
  `],
})
export class CategoryCard {
  category = input.required<Category>();
  bg = computed(() => (this.category().image ? `url(${this.category().image})` : 'none'));
}

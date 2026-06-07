import { Component, inject, signal } from '@angular/core';
import { CatalogApi } from '../../core/api/catalog-api';
import { Category } from '../../core/api/models/catalog.models';
import { CategoryCard } from '../../shared/ui/category-card/category-card';

@Component({
  selector: 'tx-home',
  standalone: true,
  imports: [CategoryCard],
  template: `
    <div class="cats">
      @for (c of categories(); track c.id) {
        <tx-category-card [category]="c" />
      }
    </div>
  `,
  styles: [`
    .cats { display: grid; gap: 1rem; padding: 1rem; }
    @media (min-width: 900px) { .cats { grid-template-columns: repeat(3, 1fr); } }
  `],
})
export class Home {
  private api = inject(CatalogApi);
  categories = signal<Category[]>([]);
  constructor() {
    this.api.getCategories().subscribe((list) => this.categories.set(list));
  }
}

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CategoryCard } from './category-card';

describe('CategoryCard', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [CategoryCard], providers: [provideRouter([])],
  }));

  it('renders the category name and links to its route', async () => {
    const fixture = TestBed.createComponent(CategoryCard);
    fixture.componentRef.setInput('category', { id: 3, name: 'Mevalar', image: '', sort_order: 1 });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Mevalar');
    const link = fixture.nativeElement.querySelector('a');
    expect(link.getAttribute('href')).toContain('/category/3');
  });
});

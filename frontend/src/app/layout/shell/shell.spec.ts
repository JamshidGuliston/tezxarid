import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Shell } from './shell';

describe('Shell', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('renders header, sidebar, router-outlet, cart panel and bottom nav', async () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    http.expectOne('http://localhost:8000/api/cities/').flush([{ id: 1, name: 'Toshkent', slug: 'toshkent' }]);
    const cat = http.match((r) => r.url.endsWith('/categories/'));
    cat.forEach((r) => r.flush([]));
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('tx-app-header')).toBeTruthy();
    expect(el.querySelector('router-outlet')).toBeTruthy();
    expect(el.querySelector('tx-cart-panel')).toBeTruthy();
    expect(el.querySelector('tx-bottom-nav')).toBeTruthy();
  });
});

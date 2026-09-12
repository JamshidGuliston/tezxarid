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

  it('renders header, sidebar categories, router-outlet, cart panel and bottom nav', async () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    // City resolution now happens in the app initializer — the shell only loads categories.
    http.expectOne((r) => r.url.endsWith('/categories/')).flush([{ id: 3, name: 'Mevalar', image: '', sort_order: 1 }]);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('tx-app-header')).toBeTruthy();
    expect(el.querySelector('router-outlet')).toBeTruthy();
    expect(el.querySelector('tx-cart-panel')).toBeTruthy();
    expect(el.querySelector('tx-bottom-nav')).toBeTruthy();
    expect(el.querySelector('.sidebar')!.textContent).toContain('Mevalar');
    http.verify();
  });
});

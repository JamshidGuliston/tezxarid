import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BottomNav } from './bottom-nav';

describe('BottomNav', () => {
  it('routes only Bosh sahifa; the rest are disabled placeholders', async () => {
    TestBed.configureTestingModule({ imports: [BottomNav], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BottomNav);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('a').length).toBe(1);
    expect(el.querySelectorAll('button:disabled').length).toBe(3);
  });
});

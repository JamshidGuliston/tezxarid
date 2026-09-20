import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BottomNav } from './bottom-nav';

@Component({ standalone: true, template: '' })
class Stub {}

describe('BottomNav', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [BottomNav],
    providers: [provideRouter([
      { path: '', component: Stub }, { path: 'search', component: Stub },
      { path: 'orders', component: Stub }, { path: 'profile', component: Stub },
    ])],
  }));

  it('links the four sections with icons and labels', async () => {
    const fixture = TestBed.createComponent(BottomNav);
    await fixture.whenStable();
    const links = Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/search', '/orders', '/profile']);
    expect(links.map((a) => a.textContent!.trim())).toEqual(['Bosh sahifa', 'Qidiruv', 'Buyurtmalar', 'Profil']);
    expect(fixture.nativeElement.querySelectorAll('a svg').length).toBe(4);
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(0);
    expect(fixture.nativeElement.querySelector('nav[aria-label]')).toBeTruthy();
    expect(links.filter((a) => a.hasAttribute('aria-current')).length).toBe(0);
  });

  it('marks the current section active', async () => {
    await TestBed.inject(Router).navigateByUrl('/search');
    const fixture = TestBed.createComponent(BottomNav);
    await fixture.whenStable();
    fixture.detectChanges();
    const active = fixture.nativeElement.querySelectorAll('a.active') as NodeListOf<HTMLAnchorElement>;
    expect(active.length).toBe(1);
    expect(active[0].getAttribute('href')).toBe('/search');
    expect(active[0].getAttribute('aria-current')).toBe('page');
  });

  it('keeps the section active when the URL carries query params', async () => {
    await TestBed.inject(Router).navigateByUrl('/search?q=olma');
    const fixture = TestBed.createComponent(BottomNav);
    await fixture.whenStable();
    fixture.detectChanges();
    const active = fixture.nativeElement.querySelectorAll('a.active') as NodeListOf<HTMLAnchorElement>;
    expect(active.length).toBe(1);
    expect(active[0].getAttribute('href')).toBe('/search');
    expect(active[0].getAttribute('aria-current')).toBe('page');
  });
});

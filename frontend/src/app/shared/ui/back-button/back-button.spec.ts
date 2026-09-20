import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { BackButton } from './back-button';
import { TelegramService } from '../../../core/telegram/telegram.service';

@Component({ standalone: true, template: '' })
class Stub {}

describe('BackButton', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [BackButton],
    providers: [provideRouter([
      { path: '', component: Stub }, { path: 'a', component: Stub }, { path: 'b', component: Stub },
      { path: '**', redirectTo: '' },
    ])],
  }));

  it('is hidden on the home page and shown elsewhere', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(BackButton);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    await router.navigateByUrl('/a');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button.back')).toBeTruthy();
  });

  it('hides again after a redirect that lands on home', async () => {
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(TestBed.inject(TelegramService), 'setBackButton');
    const fixture = TestBed.createComponent(BackButton);
    await router.navigateByUrl('/a');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button.back')).toBeTruthy();
    await router.navigateByUrl('/no-such-page');   // ** → redirectTo '' : urlAfterRedirects is '/'
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button.back')).toBeNull();
    expect(spy).toHaveBeenLastCalledWith(false, expect.any(Function));
  });

  it('goes home when there is no in-app page to return to, otherwise back in history', async () => {
    const router = TestBed.inject(Router);
    const location = TestBed.inject(Location);
    const back = vi.spyOn(location, 'back').mockImplementation(() => {});
    const navigate = vi.spyOn(router, 'navigateByUrl');
    const fixture = TestBed.createComponent(BackButton);
    await router.navigateByUrl('/a');          // first in-app navigation: nothing before it
    await fixture.whenStable();
    fixture.componentInstance.back();
    expect(back).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenLastCalledWith('/');
    await router.navigateByUrl('/b');          // now there is history to go back to
    await fixture.whenStable();
    fixture.componentInstance.back();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('does not count navigations that replace the current entry', async () => {
    const router = TestBed.inject(Router);
    const location = TestBed.inject(Location);
    const back = vi.spyOn(location, 'back').mockImplementation(() => {});
    const navigate = vi.spyOn(router, 'navigateByUrl');
    const fixture = TestBed.createComponent(BackButton);
    await router.navigateByUrl('/a');                               // deep link: depth 1
    await router.navigateByUrl('/a?q=ol', { replaceUrl: true });    // e.g. Search keeping ?q= in the URL
    await fixture.whenStable();
    fixture.componentInstance.back();
    expect(back).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenLastCalledWith('/');
  });

  it('restores the depth on browser back, so a deep-linked first page still goes home', async () => {
    const router = TestBed.inject(Router);
    const location = TestBed.inject(Location);
    const navigate = vi.spyOn(router, 'navigateByUrl');
    const fixture = TestBed.createComponent(BackButton);
    router.setUpLocationChangeListener();                          // react to popstate like the bootstrapped app
    await router.navigateByUrl('/a', { replaceUrl: true });        // how the initial navigation lands on a deep link
    await router.navigateByUrl('/b');
    const popped = firstValueFrom(router.events.pipe(filter((e) => e instanceof NavigationEnd)));
    location.back();                                               // browser back → /a
    await popped;
    await fixture.whenStable();
    expect(router.url).toBe('/a');
    fixture.componentInstance.back();
    expect(navigate).toHaveBeenLastCalledWith('/');                // depth is 1 again: nothing of ours behind /a
  });

  it('mirrors visibility to the Telegram BackButton', async () => {
    const tg = TestBed.inject(TelegramService);
    const spy = vi.spyOn(tg, 'setBackButton');
    const fixture = TestBed.createComponent(BackButton);
    await fixture.whenStable();
    expect(spy).toHaveBeenLastCalledWith(false, expect.any(Function));
    await TestBed.inject(Router).navigateByUrl('/a');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(spy).toHaveBeenLastCalledWith(true, expect.any(Function));
  });
});

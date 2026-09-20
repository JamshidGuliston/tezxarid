import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BackButton } from './back-button';
import { TelegramService } from '../../../core/telegram/telegram.service';

@Component({ standalone: true, template: '' })
class Stub {}

describe('BackButton', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [BackButton],
    providers: [provideRouter([{ path: '', component: Stub }, { path: 'a', component: Stub }, { path: 'b', component: Stub }])],
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

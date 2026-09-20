import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { operatorGuard } from './operator.guard';
import { OperatorStore } from './operator.store';

describe('operatorGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  // operatorGuard ignores route/state (like the codebase's other CanActivateFn guards), but
  // CanActivateFn's declared signature still requires them at the call site — see cart-not-empty
  // .guard.spec.ts / order-exists.guard.spec.ts for the same pattern.
  const run = () =>
    TestBed.runInInjectionContext(() =>
      operatorGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

  it('sends a signed-out visitor to the login page', () => {
    const result = run();
    expect(result).toEqual(TestBed.inject(Router).parseUrl('/order-admin/login'));
  });

  it('lets a signed-in operator through', () => {
    TestBed.inject(OperatorStore).set({ access: 'a', refresh: 'r',
      user: { id: 1, username: 'op', first_name: '', role: 'city_admin', city: 1, city_name: 'Guliston' } });
    expect(run()).toBe(true);
  });
});

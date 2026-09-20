import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AdminShell } from './admin-shell';
import { OperatorStore } from '../../core/operator/operator.store';

describe('AdminShell', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [AdminShell],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(OperatorStore).set({ access: 'a', refresh: 'r',
      user: { id: 1, username: 'op', first_name: 'Ali', role: 'city_admin', city: 1, city_name: 'Guliston' } });
  });

  it('shows the operator, the city and the console links', async () => {
    const fixture = TestBed.createComponent(AdminShell);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Guliston');
    expect(text).toContain('Ali');
    expect(text).toContain('Buyurtmalar');
    expect(text).toContain('Mijozlar');
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });

  it('signs out and returns to the login page', async () => {
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AdminShell);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button.out') as HTMLButtonElement).click();
    expect(TestBed.inject(OperatorStore).isOperator()).toBe(false);
    expect(nav).toHaveBeenCalledWith('/order-admin/login');
  });
});

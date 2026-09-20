import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AdminLogin } from './admin-login';
import { OperatorStore } from '../../core/operator/operator.store';

const SESSION = { access: 'a', refresh: 'r',
  user: { id: 1, username: 'op', first_name: 'Ali', role: 'city_admin', city: 1, city_name: 'Guliston' } };

describe('AdminLogin', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [AdminLogin],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('signs in and goes to the board', async () => {
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AdminLogin);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.form.setValue({ username: 'op', password: 'secret' });
    c.submit();
    http.expectOne((r) => r.url.endsWith('/auth/login/')).flush(SESSION);
    await fixture.whenStable();
    expect(TestBed.inject(OperatorStore).isOperator()).toBe(true);
    expect(nav).toHaveBeenCalledWith('/order-admin');
  });

  it('shows the server message when the credentials are wrong', async () => {
    const fixture = TestBed.createComponent(AdminLogin);
    fixture.detectChanges();
    fixture.componentInstance.form.setValue({ username: 'op', password: 'bad' });
    fixture.componentInstance.submit();
    http.expectOne((r) => r.url.endsWith('/auth/login/'))
      .flush({ detail: "Login yoki parol noto'g'ri." }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Login yoki parol noto'g'ri");
    expect(TestBed.inject(OperatorStore).isOperator()).toBe(false);
  });
});

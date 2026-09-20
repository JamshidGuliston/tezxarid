import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { OperatorApi } from '../../core/api/operator-api';
import { OperatorStore } from '../../core/operator/operator.store';

/** Username + password sign-in for the city operator console. */
@Component({
  selector: 'tx-admin-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="wrap">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1>Operator kirishi</h1>
        <label><span>Login</span><input formControlName="username" autocomplete="username" autocapitalize="off" /></label>
        <label><span>Parol</span><input type="password" formControlName="password" autocomplete="current-password" /></label>
        @if (error(); as msg) { <p class="err" role="alert">{{ msg }}</p> }
        <button type="submit" [disabled]="busy() || form.invalid">{{ busy() ? 'Tekshirilmoqda…' : 'Kirish' }}</button>
      </form>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: grid; place-items: center; background: #f5f5f5; padding: 1rem; }
    form { width: 100%; max-width: 22rem; background: #fff; border-radius: 16px; padding: 1.5rem; display: grid; gap: .75rem; }
    h1 { margin: 0 0 .5rem; font-size: 1.2rem; text-align: center; }
    label { display: grid; gap: .3rem; }
    label span { font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: #6b6b6b; }
    input { border: none; border-radius: 12px; background: #f3f3f3; padding: .85rem; font: inherit; }
    input:focus-visible { outline: 2px solid #F60; outline-offset: 2px; }
    button { border: none; border-radius: 12px; background: #F60; color: #fff; font: inherit; font-weight: 700; padding: .9rem; cursor: pointer; }
    button:disabled { background: #e6e6e6; color: #6b6b6b; cursor: default; }
    .err { margin: 0; color: #b42318; font-size: .9rem; }
  `],
})
export class AdminLogin {
  private api = inject(OperatorApi);
  private store = inject(OperatorStore);
  private router = inject(Router);

  form = inject(FormBuilder).nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });
  busy = signal(false);
  error = signal<string | null>(null);

  submit(): void {
    if (this.form.invalid || this.busy()) return;
    const { username, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.api.login(username, password).subscribe({
      next: (session) => {
        this.store.set(session);
        this.busy.set(false);
        void this.router.navigateByUrl('/order-admin');
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.detail ?? "Kirishda xatolik. Qayta urinib ko'ring.");
        this.busy.set(false);
      },
    });
  }
}

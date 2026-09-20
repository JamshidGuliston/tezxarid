import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, finalize, map, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { AuthApi } from '../api/auth-api';
import { OperatorStore } from './operator.store';

const OPERATOR_PREFIX = '/api/operator/';

function sign<T>(req: HttpRequest<T>, token: string | null, cityId: number | null): HttpRequest<T> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (cityId != null) headers['X-City-Id'] = String(cityId);
  return Object.keys(headers).length ? req.clone({ setHeaders: headers }) : req;
}

/** Signs /api/operator/ calls with the operator token and refreshes it once on 401. */
export const operatorInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes(OPERATOR_PREFIX)) return next(req);
  const store = inject(OperatorStore);
  const api = inject(AuthApi);

  return next(sign(req, store.access(), store.headerCityId())).pipe(
    catchError((err: HttpErrorResponse) => {
      const refresh = store.refresh();
      if (err.status !== 401 || !refresh) return throwError(() => err);
      store.refreshing ??= api.refresh(refresh).pipe(
        map((r) => r.access),
        tap((access) => store.setAccess(access)),
        catchError((e) => { store.signOut(); return throwError(() => e); }),
        finalize(() => { store.refreshing = null; }),
        shareReplay(1),
      );
      return store.refreshing.pipe(
        catchError(() => throwError(() => err)),
        switchMap((access) => next(sign(req, access, store.headerCityId()))),
      );
    }),
  );
};

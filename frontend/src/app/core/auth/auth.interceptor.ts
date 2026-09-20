import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, finalize, map, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { AuthApi } from '../api/auth-api';
import { TokenStore } from './token.store';

const AUTH_PATHS = ['/auth/telegram/', '/auth/token/refresh/'];

function withBearer<T>(req: HttpRequest<T>, token: string | null): HttpRequest<T> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/** Adds the JWT to API calls; on 401 refreshes the access token once (shared) and retries. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes('/api/operator/') || AUTH_PATHS.some((p) => req.url.includes(p))) return next(req);
  const tokens = inject(TokenStore);
  const api = inject(AuthApi);

  return next(withBearer(req, tokens.access())).pipe(
    catchError((err: HttpErrorResponse) => {
      const refresh = tokens.refresh();
      if (err.status !== 401 || !refresh) return throwError(() => err);
      tokens.refreshing ??= api.refresh(refresh).pipe(
        map((r) => r.access),
        tap((access) => tokens.setAccess(access)),
        catchError((e) => { tokens.clear(); return throwError(() => e); }),
        finalize(() => { tokens.refreshing = null; }),
        shareReplay(1),
      );
      return tokens.refreshing.pipe(
        catchError(() => throwError(() => err)),
        switchMap((access) => next(withBearer(req, access))),
      );
    }),
  );
};

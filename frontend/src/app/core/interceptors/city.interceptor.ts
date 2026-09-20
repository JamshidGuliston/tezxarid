import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { CityService } from '../city/city.service';

export const cityInterceptor: HttpInterceptorFn = (req, next) => {
  // Operator calls carry their own city (the server pins it to the operator's account).
  if (req.url.includes('/api/operator/')) return next(req);
  const cityId = inject(CityService).cityId;
  if (cityId != null) {
    return next(req.clone({ setHeaders: { 'X-City-Id': String(cityId) } }));
  }
  return next(req);
};

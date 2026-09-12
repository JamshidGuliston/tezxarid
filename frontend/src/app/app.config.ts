import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { CityService } from './core/city/city.service';
import { cityInterceptor } from './core/interceptors/city.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withFetch(),
      withInterceptors([cityInterceptor, errorInterceptor]),
    ),
    // Resolve the active city before any routed component loads, so every
    // city-scoped request (catalog, delivery slots, orders) carries X-City-Id.
    provideAppInitializer(() =>
      inject(CityService)
        .init()
        .catch((err) => console.error('City init failed', err)),
    ),
  ],
};

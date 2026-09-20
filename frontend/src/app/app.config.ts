import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor } from './core/auth/auth.interceptor';
import { CityService } from './core/city/city.service';
import { cityInterceptor } from './core/interceptors/city.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { operatorInterceptor } from './core/operator/operator.interceptor';
import { TelegramService } from './core/telegram/telegram.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Interceptors run outer→inner on the request path but inner→outer on the error path
    // (Angular builds the chain with reduceRight), so authInterceptor must be innermost:
    // its refresh-and-retry then resolves before errorInterceptor ever sees the failure,
    // and only errors that survive the retry (or have no refresh token to try) reach it.
    provideHttpClient(
      withFetch(),
      withInterceptors([operatorInterceptor, cityInterceptor, errorInterceptor, authInterceptor]),
    ),
    // Before any routed component loads: tell Telegram we're ready, resolve the active city
    // (X-City-Id on every city-scoped request) and, inside Telegram, sign the user in.
    // Both lookups run in parallel and each swallows its own failure.
    provideAppInitializer(() => {
      inject(TelegramService).ready();
      const city = inject(CityService).init().catch((err) => console.error('City init failed', err));
      const auth = inject(AuthService).initFromTelegram();
      return Promise.all([city, auth]).then(() => undefined);
    }),
  ],
};

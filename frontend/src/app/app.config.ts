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
import { TelegramService } from './core/telegram/telegram.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withFetch(),
      withInterceptors([cityInterceptor, authInterceptor, errorInterceptor]),
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

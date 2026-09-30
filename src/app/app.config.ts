import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    /**
     * Zoneless is already the default from Angular v21 onwards, so this call is
     * technically redundant. It is kept on purpose: this app teaches change
     * detection, and an explicit provider documents the intent instead of
     * relying on a framework default that is invisible in the source.
     */
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      /**
       * Reset the scroll position on navigation. Without this, switching tabs
       * keeps the previous scroll offset and the new page appears to open
       * halfway down.
       */
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
  ],
};

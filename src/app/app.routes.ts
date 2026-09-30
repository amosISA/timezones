import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'why-timezones',
    pathMatch: 'full',
  },
  {
    path: 'why-timezones',
    loadComponent: () => import('./pages/why-timezones/why-timezones').then((m) => m.WhyTimezones),
  },
  {
    path: 'how-dates-work',
    loadComponent: () =>
      import('./pages/how-dates-work/how-dates-work').then((m) => m.HowDatesWork),
  },
  {
    path: 'dst',
    loadComponent: () => import('./pages/dst/dst').then((m) => m.Dst),
  },
  {
    path: 'intl-api',
    loadComponent: () => import('./pages/intl-api/intl-api').then((m) => m.IntlApi),
  },
  {
    path: 'angular-dates',
    loadComponent: () => import('./pages/angular-dates/angular-dates').then((m) => m.AngularDates),
  },
  {
    path: 'libraries',
    loadComponent: () => import('./pages/libraries/libraries').then((m) => m.Libraries),
  },
  {
    path: 'switch-timezone',
    loadComponent: () =>
      import('./pages/switch-timezone/switch-timezone').then((m) => m.SwitchTimezone),
  },
  {
    path: 'playground',
    loadComponent: () => import('./pages/playground/playground').then((m) => m.Playground),
  },
  {
    path: 'sources',
    loadComponent: () => import('./pages/sources/sources').then((m) => m.Sources),
  },
  {
    // Anything unrecognised falls back to the first topic rather than a blank page.
    path: '**',
    redirectTo: 'why-timezones',
  },
];

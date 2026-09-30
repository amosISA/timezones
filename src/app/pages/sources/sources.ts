import { ChangeDetectionStrategy, Component } from '@angular/core';

interface SourceLink {
  readonly title: string;
  readonly note: string;
  readonly url: string;
}

interface SourceGroup {
  readonly title: string;
  readonly sources: readonly SourceLink[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-sources',
  templateUrl: './sources.html',
})
export class Sources {
  readonly checkedOn = '16 September 2026';

  readonly groups: readonly SourceGroup[] = [
    {
      title: 'JavaScript and internationalisation specifications',
      sources: [
        {
          title: 'ECMA-262 — Date Time String Format',
          note: 'The normative parsing rules for date-only and date-time strings.',
          url: 'https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date-time-string-format',
        },
        {
          title: 'ECMA-402 — Intl.DateTimeFormat',
          note: 'The normative internationalisation and time-zone formatting API.',
          url: 'https://tc39.es/ecma402/#datetimeformat-objects',
        },
        {
          title: 'MDN — Date',
          note: 'Date objects, epoch milliseconds, UTC, local rendering, and the meaning of Z.',
          url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date',
        },
        {
          title: 'MDN — Date.parse()',
          note: 'Required formats, invariants, and the warning around implementation-defined input.',
          url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse',
        },
        {
          title: 'MDN — Intl.supportedValuesOf()',
          note: 'Primary IANA identifiers and compatibility notes.',
          url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/supportedValuesOf',
        },
        {
          title: 'TC39 — Temporal Stage 4 specification',
          note: 'Disambiguation, immutable date/time types, zones, and DST-safe arithmetic.',
          url: 'https://tc39.es/proposal-temporal/',
        },
        {
          title: 'TC39 — Temporal implementation status',
          note: 'Engine versions reported as shipped and the current Safari status.',
          url: 'https://github.com/tc39/proposal-temporal#implementation-status',
        },
      ],
    },
    {
      title: 'Time-zone data and history',
      sources: [
        {
          title: 'IANA Time Zone Database',
          note: 'The maintained database behind regional rules and identifiers.',
          url: 'https://www.iana.org/time-zones',
        },
        {
          title: 'IANA tzdb theory',
          note: 'Naming, scope, historical data, links, and database limitations.',
          url: 'https://data.iana.org/time-zones/theory.html',
        },
        {
          title: 'NIST — Coordinated Universal Time',
          note: 'UTC as the international reference time scale and local time as an offset from it.',
          url: 'https://www.nist.gov/pml/time-and-frequency-division/how-utcnist-related-coordinated-universal-time-utc-international',
        },
        {
          title: 'NIST — A Walk Through Time',
          note: 'Prime meridian, standard time, and the historical move away from local solar time.',
          url: 'https://www.nist.gov/pml/time-and-frequency-division/popular-links/walk-through-time',
        },
        {
          title: 'Unicode CLDR — Windows zone mappings',
          note: 'Maintained mappings between Windows time-zone identifiers and IANA zones.',
          url: 'https://unicode.org/cldr/charts/latest/supplemental/zone_tzid.html',
        },
      ],
    },
    {
      title: 'Angular 22.1.4',
      sources: [
        {
          title: 'Angular source — format_date.ts at 22.1.4',
          note: 'Date parsing, fixed-offset handling, and timezoneToOffset.',
          url: 'https://github.com/angular/angular/blob/v22.1.4/packages/common/src/i18n/format_date.ts',
        },
        {
          title: 'Angular API — DatePipe',
          note: 'Pure-pipe behaviour, locale input, timezone input, and defaults.',
          url: 'https://angular.dev/api/common/DatePipe',
        },
        {
          title: 'Angular API — DATE_PIPE_DEFAULT_OPTIONS',
          note: 'Application-wide date format and fixed timezone configuration.',
          url: 'https://angular.dev/api/common/DATE_PIPE_DEFAULT_OPTIONS',
        },
        {
          title: 'Angular guide — Zoneless',
          note: 'Zoneless is the default in Angular 21 and later.',
          url: 'https://angular.dev/guide/zoneless',
        },
      ],
    },
    {
      title: 'Browser and test tooling',
      sources: [
        {
          title: 'MDN — datetime-local',
          note: 'The control returns a local wall-clock value without an offset or zone.',
          url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/datetime-local',
        },
        {
          title: 'Chrome DevTools — Sensors',
          note: 'Location, locale, and timezone overrides for the inspected page.',
          url: 'https://developer.chrome.com/docs/devtools/sensors',
        },
        {
          title: 'Chrome DevTools — Custom locations',
          note: 'Reusable presets with coordinates, IANA timezone ID, and BCP 47 locale.',
          url: 'https://developer.chrome.com/docs/devtools/settings/locations',
        },
        {
          title: 'Playwright — timezoneId',
          note: 'Per-browser-context timezone emulation for deterministic tests.',
          url: 'https://playwright.dev/docs/api/class-browser#browser-new-context-option-timezone-id',
        },
        {
          title: 'Node.js CLI — TZ',
          note: 'The documented TZ environment variable support for Node processes.',
          url: 'https://nodejs.org/api/cli.html#tz',
        },
      ],
    },
    {
      title: 'Library comparison data',
      sources: [
        {
          title: 'npm registry API',
          note: 'Package versions and weekly downloads; the table records the exact snapshot dates.',
          url: 'https://github.com/npm/registry/blob/main/docs/download-counts.md',
        },
        {
          title: 'Bundlephobia',
          note: 'Indicative minified and gzipped package-size estimates.',
          url: 'https://bundlephobia.com/',
        },
        {
          title: 'Moment project status',
          note: 'The maintainers explain why Moment is a legacy project and what that means.',
          url: 'https://momentjs.com/docs/#/-project-status/',
        },
      ],
    },
    {
      title: 'Presentation tooling',
      sources: [
        {
          title: 'Shiki — installation',
          note: 'The syntax highlighter used by every source-code panel in this app.',
          url: 'https://shiki.style/guide/install',
        },
        {
          title: 'Shiki — tokens',
          note: 'Token output is rendered with Angular interpolation rather than injected HTML.',
          url: 'https://shiki.style/guide/install#advanced-usage',
        },
      ],
    },
  ];
}

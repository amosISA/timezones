import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Where a library's timezone rules come from. This is the decisive difference. */
type TzSource =
  /** Reads the engine's ICU/tzdb snapshot. Zero bundled data, but old runtimes can be stale. */
  | 'engine'
  /** Ships its own copy of tzdata. Large, and goes stale unless you update it. */
  | 'bundled'
  /** No timezone handling at all beyond the host's local zone. */
  | 'none';

type Health = 'native' | 'active' | 'maintenance' | 'legacy';

interface Library {
  readonly name: string;
  readonly packageName: string;
  readonly version: string;
  /** Approximate weekly npm downloads, as a human-readable string. */
  readonly downloads: string;
  /** Minified + gzipped size in kB. Null for the native API. */
  readonly gzipKb: number | null;
  readonly tzSource: TzSource;
  readonly tzNote: string;
  readonly immutable: boolean;
  readonly treeShakeable: boolean;
  readonly health: Health;
  readonly bestFor: string;
  readonly watchOut: string;
  readonly url: string;
}

@Component({
  selector: 'app-libraries',
  imports: [RouterLink],
  templateUrl: './libraries.html',
  styleUrl: './libraries.scss',
})
export class Libraries {
  /**
   * Whether this runtime exposes the native Temporal API. Checked at runtime
   * rather than asserted, because the answer is changing month to month.
   */
  readonly hasTemporal = signal(
    typeof (globalThis as { Temporal?: unknown }).Temporal !== 'undefined',
  );

  readonly localTimezone = signal(Intl.DateTimeFormat().resolvedOptions().timeZone);

  /**
   * Package versions and weekly downloads were checked against npm on
   * 16 September 2026 (downloads: 5–11 September). Bundle sizes are
   * indicative Bundlephobia estimates and vary with imports and tooling.
   */
  readonly libraries: readonly Library[] = [
    {
      name: 'Temporal',
      packageName: 'native (ES2026)',
      version: '—',
      downloads: 'built in',
      gzipKb: null,
      tzSource: 'engine',
      tzNote: 'First-class IANA zones in the type system itself',
      immutable: true,
      treeShakeable: true,
      health: 'native',
      bestFor: 'Everything, once your support matrix allows it. This is the destination.',
      watchOut:
        'Not in Safari stable yet. Ship the polyfill until it is, or gate on feature detection.',
      url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal',
    },
    {
      name: 'temporal-polyfill',
      packageName: 'temporal-polyfill',
      version: '1.0.5',
      downloads: '2.6M/wk',
      gzipKb: 19,
      tzSource: 'engine',
      tzNote: 'Delegates to the engine ICU data',
      immutable: true,
      treeShakeable: false,
      health: 'active',
      bestFor: 'Writing Temporal code today and deleting the dependency later.',
      watchOut:
        'The smaller of the two polyfills. Its API surface tracks the final spec — pin the version.',
      url: 'https://github.com/fullcalendar/temporal-polyfill',
    },
    {
      name: 'Luxon',
      packageName: 'luxon',
      version: '3.7.2',
      downloads: '28.1M/wk',
      gzipKb: 21,
      tzSource: 'engine',
      tzNote: 'Built on Intl — no tzdata shipped',
      immutable: true,
      treeShakeable: false,
      health: 'active',
      bestFor:
        'Serious timezone work today. By far the best ergonomics-to-weight ratio for zone-heavy apps.',
      watchOut:
        'One monolithic import; you get the whole library. Written by a Moment maintainer, so the mental model transfers.',
      url: 'https://moment.github.io/luxon/',
    },
    {
      name: 'date-fns',
      packageName: 'date-fns',
      version: '4.4.0',
      downloads: '69.5M/wk',
      gzipKb: 17,
      tzSource: 'none',
      tzNote: 'Core has no zone support — pair it with @date-fns/tz',
      immutable: true,
      treeShakeable: true,
      health: 'active',
      bestFor:
        'Formatting and arithmetic on plain Dates where you only need the local zone. Import what you use.',
      watchOut:
        'The headline size is the whole library; a realistic import is 2–4 kB. v4 added zone support via a separate package — v3 and earlier could not do zones at all.',
      url: 'https://date-fns.org/',
    },
    {
      name: '@date-fns/tz',
      packageName: '@date-fns/tz',
      version: '1.5.0',
      downloads: '25.0M/wk',
      gzipKb: 2,
      tzSource: 'engine',
      tzNote: 'TZDate extends Date, resolved through Intl',
      immutable: false,
      treeShakeable: true,
      health: 'active',
      bestFor: 'Adding zone awareness to an existing date-fns v4 codebase for almost no bytes.',
      watchOut:
        'Replaces the older date-fns-tz. Its TZDate subclasses Date, so it inherits mutable setters.',
      url: 'https://github.com/date-fns/tz',
    },
    {
      name: 'Day.js',
      packageName: 'dayjs',
      version: '1.11.23',
      downloads: '51.8M/wk',
      gzipKb: 3,
      tzSource: 'engine',
      tzNote: 'Via the timezone plugin, which needs the utc plugin too',
      immutable: true,
      treeShakeable: false,
      health: 'active',
      bestFor: 'Migrating off Moment with minimal churn — the API is deliberately near-identical.',
      watchOut:
        'The 3 kB figure is the core only. Zone support means loading two plugins, and the plugin model means the type surface is stitched together by declaration merging.',
      url: 'https://day.js.org/',
    },
    {
      name: 'Moment',
      packageName: 'moment',
      version: '2.31.0',
      downloads: '25.7M/wk',
      gzipKb: 75,
      tzSource: 'none',
      tzNote: 'Needs moment-timezone for anything zone-aware',
      immutable: false,
      treeShakeable: false,
      health: 'legacy',
      bestFor: 'Nothing new. Its own maintainers say so.',
      watchOut:
        'Mutable API, no tree-shaking, and 25× the weight of Day.js. Still widely downloaded because many existing applications depend on it.',
      url: 'https://momentjs.com/docs/#/-project-status/',
    },
    {
      name: 'Moment Timezone',
      packageName: 'moment-timezone',
      version: '0.6.4',
      downloads: '12.9M/wk',
      gzipKb: 114,
      tzSource: 'bundled',
      tzNote: 'Ships its own copy of the IANA database',
      immutable: false,
      treeShakeable: false,
      health: 'legacy',
      bestFor: 'Legacy codebases that must support engines with no usable Intl.',
      watchOut:
        'The heaviest option by a wide margin, and its tzdata goes stale the moment you stop updating it. This is what Luxon exists to replace.',
      url: 'https://momentjs.com/timezone/',
    },
    {
      name: 'js-joda',
      packageName: '@js-joda/core',
      version: '6.1.0',
      downloads: '3.2M/wk',
      gzipKb: 40,
      tzSource: 'none',
      tzNote: 'Zones need @js-joda/timezone (+38 kB gzip, bundled tzdata)',
      immutable: true,
      treeShakeable: false,
      health: 'active',
      bestFor:
        'Teams who already think in java.time. Its separation of Instant / LocalDate / ZonedDateTime is genuinely excellent.',
      watchOut:
        'Heavy once you add zones, and its idioms are unfamiliar to most JS developers. Temporal borrows many of the same ideas natively.',
      url: 'https://js-joda.github.io/js-joda/',
    },
    {
      name: '@internationalized/date',
      packageName: '@internationalized/date',
      version: '3.12.4',
      downloads: '11.1M/wk',
      gzipKb: 11,
      tzSource: 'engine',
      tzNote: 'Intl-based, with a Temporal-shaped type split',
      immutable: true,
      treeShakeable: true,
      health: 'active',
      bestFor:
        'Date pickers and calendar UI. Adobe built it for React Aria, and its CalendarDate type avoids the date-only trap by construction.',
      watchOut: 'Scoped to what UI components need — not a general-purpose formatting library.',
      url: 'https://react-spectrum.adobe.com/internationalized/date/',
    },
    {
      name: 'Intl (native)',
      packageName: 'native',
      version: '—',
      downloads: 'built in',
      gzipKb: null,
      tzSource: 'engine',
      tzNote: 'The engine ICU database, directly',
      immutable: true,
      treeShakeable: true,
      health: 'native',
      bestFor:
        'All display formatting, in any zone, in any locale. Most apps need no library for this at all.',
      watchOut:
        'Formatting only. It can render an instant in any zone but cannot parse, add, or subtract.',
      url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat',
    },
  ];

  /** Grouped for the "how tzdata reaches your users" explainer. */
  readonly engineBacked = computed(() =>
    this.libraries.filter((library) => library.tzSource === 'engine'),
  );
  readonly bundleBacked = computed(() =>
    this.libraries.filter((library) => library.tzSource === 'bundled'),
  );

  /** Live Temporal examples, only rendered when the runtime supports it. */
  readonly temporalDemo = computed(() => {
    if (!this.hasTemporal()) return null;

    const temporal = (globalThis as unknown as { Temporal: any }).Temporal;
    const start = temporal.ZonedDateTime.from('2024-03-09T12:00:00[America/New_York]');

    return {
      start: start.toString(),
      plusCalendarDay: start.add({ days: 1 }).toString(),
      plusExactHours: start.add({ hours: 24 }).toString(),
      monthOfJune: temporal.PlainDate.from('2024-06-15').month,
      plainDate: temporal.PlainDate.from('2024-06-15').toString(),
      ambiguousEarlier: temporal.ZonedDateTime.from(
        { year: 2024, month: 11, day: 3, hour: 1, minute: 30, timeZone: 'America/New_York' },
        { disambiguation: 'earlier' },
      ).toString(),
      ambiguousLater: temporal.ZonedDateTime.from(
        { year: 2024, month: 11, day: 3, hour: 1, minute: 30, timeZone: 'America/New_York' },
        { disambiguation: 'later' },
      ).toString(),
    };
  });

  /** Maps the trap pages to how Temporal removes each one. */
  readonly temporalFixes: ReadonlyArray<{
    readonly problem: string;
    readonly solution: string;
  }> = [
    {
      problem: 'A date-only string silently becomes a UTC instant',
      solution: 'Temporal.PlainDate has no time and no zone. The conversion cannot happen.',
    },
    {
      problem: 'Months are zero-indexed',
      solution: 'Months are 1–12. June is 6.',
    },
    {
      problem: 'Setters mutate the object you were holding',
      solution: 'Every object is immutable. .add() and .with() return new instances.',
    },
    {
      problem: '"Add a day" is ambiguous across DST',
      solution: 'add({ days: 1 }) is calendar arithmetic; add({ hours: 24 }) is exact time.',
    },
    {
      problem: 'A nonexistent local time slides silently to another instant',
      solution: "disambiguation: 'reject' throws instead of guessing.",
    },
    {
      problem: 'An ambiguous local time picks one of two instants at random',
      solution: "disambiguation: 'earlier' | 'later' makes you state which one you meant.",
    },
    {
      problem: 'No format patterns, so everyone reached for a library',
      solution: 'Interoperates directly with Intl.DateTimeFormat for output.',
    },
    {
      problem: 'A Date cannot say which zone it belongs to',
      solution: 'ZonedDateTime carries the IANA identifier as part of its value.',
    },
  ];

  readonly decisionGuide: ReadonlyArray<{
    readonly need: string;
    readonly answer: string;
    readonly why: string;
    readonly tone: 'green' | 'cyan' | 'amber';
  }> = [
    {
      need: 'I only need to display dates, in any zone or locale',
      answer: 'Intl.DateTimeFormat — no dependency',
      why: 'It is built in, IANA-aware and locale-aware. Most "we need a date library" conversations end here.',
      tone: 'green',
    },
    {
      need: 'I need arithmetic and formatting, local zone only',
      answer: 'date-fns',
      why: 'Tree-shakeable pure functions. A realistic import lands at a couple of kilobytes.',
      tone: 'green',
    },
    {
      need: 'I need real multi-zone logic, and I need it in production now',
      answer: 'Luxon',
      why: 'Immutable, Intl-backed, 21 kB, and the zone API is the one part it takes most seriously.',
      tone: 'cyan',
    },
    {
      need: 'I am starting fresh and can control the support matrix',
      answer: 'Temporal, with temporal-polyfill',
      why: 'Write against the API that will still be correct in five years. Drop the polyfill when Safari ships.',
      tone: 'cyan',
    },
    {
      need: 'I am building a date picker or calendar UI',
      answer: '@internationalized/date',
      why: 'Its CalendarDate type makes the date-only bug structurally impossible.',
      tone: 'cyan',
    },
    {
      need: 'I am stuck on Moment and need to move',
      answer: 'Day.js first, then Luxon or Temporal',
      why: 'Day.js is a near drop-in for a fast size win. Move to Luxon or Temporal when you can afford the API change.',
      tone: 'amber',
    },
  ];
}

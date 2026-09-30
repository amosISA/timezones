import { Component, computed, signal } from '@angular/core';
import { DatePipe, formatDate } from '@angular/common';
import { RouterLink } from '@angular/router';

import { wallClockIn, zoneOffsetLabel } from '../../core/timezone';
import { CodeBlock } from '../../shared/code-block';

/** One row of the DatePipe-versus-Intl comparison. */
interface ComparisonRow {
  readonly label: string;
  /** What is passed as DatePipe's third argument. */
  readonly argument: string;
  readonly angularOutput: string;
  readonly intlOutput: string;
  /** True when Angular agrees with the zone-aware truth. */
  readonly correct: boolean;
  readonly note: string;
}

@Component({
  selector: 'app-angular-dates',
  imports: [CodeBlock, DatePipe, RouterLink],
  templateUrl: './angular-dates.html',
  styleUrl: './angular-dates.scss',
})
export class AngularDates {
  readonly timezoneToOffsetCode = `function timezoneToOffset(timezone, fallback) {
  timezone = timezone.replace(/:/g, '');
  const requestedTimezoneOffset =
    Date.parse('Jan 01, 1970 00:00:00 ' + timezone) / 60000;
  return isNaN(requestedTimezoneOffset) ? fallback : requestedTimezoneOffset;
}`;

  readonly intlZoneCode = `new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York',
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(instant);`;

  readonly brokenClockCode = `private readonly now = new Date();

tick() {
  // Same object: DatePipe sees no pure change.
  // A bare timer also does not notify zoneless Angular.
  this.now.setTime(Date.now());
}`;

  readonly signalClockCode = `readonly now = signal(new Date());

constructor() {
  effect((onCleanup) => {
    const id = setInterval(() => this.now.set(new Date()), 1000);
    onCleanup(() => clearInterval(id));
  });
}`;

  readonly defaultDateOptionsCode = `import { DATE_PIPE_DEFAULT_OPTIONS } from '@angular/common';

providers: [
  {
    provide: DATE_PIPE_DEFAULT_OPTIONS,
    useValue: {
      dateFormat: 'medium',
      timezone: '+0000',
    },
  },
];`;

  readonly localeRegistrationCode = `import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';

registerLocaleData(localeEs, 'es');

providers: [
  { provide: LOCALE_ID, useValue: 'es' },
];`;

  /** Fixed to July so the northern-summer DST discrepancy is visible. */
  readonly reference = signal(new Date('2024-07-15T12:00:00Z'));

  readonly hostTimezone = signal(Intl.DateTimeFormat().resolvedOptions().timeZone);

  /**
   * Offsets, not IANA names. `DatePipe` resolves its timezone argument through
   * `Date.parse('Jan 01, 1970 00:00:00 ' + timezone)`, so only values that
   * `Date.parse` recognises as a trailing zone designator work at all.
   */
  readonly offsets = signal(['UTC', '+0000', '+0100', '+0200', '+0530', '+0545', '-0300', '-0500']);

  readonly selectedOffset = signal('+0530');

  readonly formats = signal([
    { value: 'short', label: 'short' },
    { value: 'medium', label: 'medium' },
    { value: 'long', label: 'long' },
    { value: 'full', label: 'full' },
    { value: 'shortDate', label: 'shortDate' },
    { value: 'mediumDate', label: 'mediumDate' },
    { value: 'shortTime', label: 'shortTime' },
    { value: 'mediumTime', label: 'mediumTime' },
    { value: 'yyyy-MM-dd HH:mm:ss', label: 'yyyy-MM-dd HH:mm:ss (custom)' },
    { value: "EEEE, MMMM d, y 'at' h:mm a", label: "EEEE, MMMM d, y 'at' h:mm a" },
  ]);

  readonly selectedFormat = signal('medium');

  readonly templateCodeSnippet = computed(
    () => `{{ myDate | date: '${this.selectedFormat()}' : '${this.selectedOffset()}' }}`,
  );

  /**
   * The headline demonstration: what `DatePipe` does when handed an IANA name
   * versus what the zone actually is. Both columns are computed live, so the
   * discrepancy is real rather than asserted.
   */
  readonly ianaComparison = computed<ComparisonRow[]>(() => {
    const instant = this.reference();
    const pattern = 'yyyy-MM-dd HH:mm';

    const angular = (timezone?: string) => formatDate(instant, pattern, 'en-US', timezone);

    /**
     * Must produce the exact same shape as `pattern` above, otherwise the two
     * columns are not comparable and every row would read as a mismatch.
     */
    const truth = (timeZone: string) => {
      const wall = wallClockIn(instant, timeZone);
      const pad = (value: number) => String(value).padStart(2, '0');
      return `${wall.year}-${pad(wall.month)}-${pad(wall.day)} ${pad(wall.hour)}:${pad(wall.minute)}`;
    };

    const hostOutput = angular();

    const rows: ComparisonRow[] = [
      {
        label: 'No timezone argument',
        argument: '(omitted)',
        angularOutput: hostOutput,
        intlOutput: truth(this.hostTimezone()),
        correct: true,
        note: 'Falls back to the host zone, which is the documented behaviour.',
      },
      {
        label: 'An IANA identifier',
        argument: "'America/New_York'",
        angularOutput: angular('America/New_York'),
        intlOutput: truth('America/New_York'),
        correct: angular('America/New_York') === truth('America/New_York'),
        note: 'Date.parse cannot read this, so Angular silently uses the host zone instead.',
      },
      {
        label: 'Another IANA identifier',
        argument: "'Asia/Tokyo'",
        angularOutput: angular('Asia/Tokyo'),
        intlOutput: truth('Asia/Tokyo'),
        correct: angular('Asia/Tokyo') === truth('Asia/Tokyo'),
        note: 'Identical output to the row above — the argument had no effect at all.',
      },
      {
        label: 'A numeric offset',
        argument: "'-0400'",
        angularOutput: angular('-0400'),
        intlOutput: truth('America/New_York'),
        correct: angular('-0400') === truth('America/New_York'),
        note: 'This works, because -0400 is what New York happens to be using in July.',
      },
      {
        label: 'UTC',
        argument: "'UTC'",
        angularOutput: angular('UTC'),
        intlOutput: truth('UTC'),
        correct: angular('UTC') === truth('UTC'),
        note: 'Date.parse understands UTC and GMT, so these are safe.',
      },
    ];

    return rows;
  });

  /**
   * The second failure: a numeric offset is frozen, so it cannot follow a zone
   * across a daylight saving boundary. One of these two rows must be wrong.
   */
  readonly frozenOffset = computed(() => {
    const winter = new Date('2024-01-15T12:00:00Z');
    const summer = new Date('2024-07-15T12:00:00Z');
    const zone = 'America/New_York';
    const pattern = 'HH:mm';

    /** Same `HH:mm` shape as the Angular column, so the two are comparable. */
    const time = (instant: Date) => {
      const wall = wallClockIn(instant, zone);
      const pad = (value: number) => String(value).padStart(2, '0');
      return `${pad(wall.hour)}:${pad(wall.minute)}`;
    };

    return {
      zone,
      winterAngular: formatDate(winter, pattern, 'en-US', '-0500'),
      winterTruth: time(winter),
      winterOffset: zoneOffsetLabel(winter, zone),
      summerAngular: formatDate(summer, pattern, 'en-US', '-0500'),
      summerTruth: time(summer),
      summerOffset: zoneOffsetLabel(summer, zone),
    };
  });

  /**
   * The good news: Angular's own `toDate` special-cases date-only strings and
   * builds them as local calendar dates, so it avoids the off-by-one bug the
   * platform constructor walks straight into.
   */
  readonly dateOnlyHandling = computed(() => {
    const input = '2024-06-15';
    const native = new Date(input);

    return {
      input,
      angular: formatDate(input, 'EEEE, d MMMM y', 'en-US'),
      nativeIso: native.toISOString(),
      nativeLocal: new Intl.DateTimeFormat('en-GB', { dateStyle: 'full' }).format(native),
      // True when the host zone is behind UTC, where the discrepancy shows.
      differs: formatDate(input, 'd', 'en-US') !== String(native.getDate()),
    };
  });

  readonly formatDateExample = computed(() =>
    formatDate(this.reference(), 'full', 'en-US', this.selectedOffset()),
  );

  onOffsetChange(event: Event): void {
    this.selectedOffset.set((event.target as HTMLSelectElement).value);
  }

  onFormatChange(event: Event): void {
    this.selectedFormat.set((event.target as HTMLSelectElement).value);
  }
}

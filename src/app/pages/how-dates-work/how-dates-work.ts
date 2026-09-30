import { Component, computed, signal } from '@angular/core';
import { CodeBlock } from '../../shared/code-block';

/** One row of the "how does this string parse?" comparison. */
interface ParseSample {
  readonly input: string;
  /** Which rule the spec applies to this shape of string. */
  readonly rule: string;
  readonly interpretedAs: 'utc' | 'local' | 'explicit' | 'invalid';
  readonly iso: string;
  readonly localDay: string;
  readonly localTime: string;
}

/** A single built-in `Date` stringifier and what it produced. */
interface FormatterOutput {
  readonly method: string;
  readonly output: string;
  readonly basis: 'local' | 'utc';
}

/** A demonstrated footgun with a before/after pair of real values. */
interface BugDemo {
  readonly wrong: string;
  readonly right: string;
}

@Component({
  selector: 'app-how-dates-work',
  imports: [CodeBlock],
  templateUrl: './how-dates-work.html',
  styleUrl: './how-dates-work.scss',
})
export class HowDatesWork {
  readonly mutatingDateCode = `const original = new Date(2024, 0, 10);
const aliased = original;
aliased.setMonth(5);`;

  readonly copiedDateCode = `const pristine = new Date(2024, 0, 10);
const copy = new Date(pristine);
copy.setMonth(5);`;

  readonly localTimezone = signal(Intl.DateTimeFormat().resolvedOptions().timeZone);
  readonly inputDate = signal('2024-06-15T14:30:00');

  // ---------------------------------------------------------------------------
  // Trap 1 — the shape of the string decides the timezone rule
  // ---------------------------------------------------------------------------

  /**
   * The single most common date bug in JavaScript. Per ECMA-262, a *date-only*
   * ISO string is interpreted as UTC, while a *date-time* ISO string with no
   * offset is interpreted as local time. Same-looking strings, opposite rules.
   */
  readonly parseSamples = computed<ParseSample[]>(() =>
    [
      {
        input: '2024-06-15',
        rule: 'Date-only ISO form → forced to UTC midnight',
        interpretedAs: 'utc' as const,
      },
      {
        input: '2024-06-15T00:00:00',
        rule: 'Date-time ISO form, no offset → local time',
        interpretedAs: 'local' as const,
      },
      {
        input: '2024-06-15T00:00:00Z',
        rule: 'Explicit Z → UTC, unambiguous',
        interpretedAs: 'explicit' as const,
      },
      {
        input: '2024-06-15T00:00:00+05:30',
        rule: 'Explicit offset → unambiguous',
        interpretedAs: 'explicit' as const,
      },
    ].map(({ input, rule, interpretedAs }) => {
      const parsed = new Date(input);
      const valid = !Number.isNaN(parsed.getTime());

      return {
        input,
        rule,
        interpretedAs: valid ? interpretedAs : ('invalid' as const),
        iso: valid ? parsed.toISOString() : 'Invalid Date',
        localDay: valid
          ? new Intl.DateTimeFormat('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            }).format(parsed)
          : '—',
        localTime: valid
          ? new Intl.DateTimeFormat('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).format(parsed)
          : '—',
      };
    }),
  );

  /**
   * True when the visitor's zone is behind UTC, which is exactly when the
   * date-only form visibly loses a day. Used to tailor the warning copy.
   */
  readonly isBehindUtc = computed(() => new Date().getTimezoneOffset() > 0);

  /** The off-by-one-day bug, evaluated against the visitor's real zone. */
  readonly offByOneDay = computed<BugDemo>(() => {
    const dateOnly = new Date('2024-06-15');
    const dateTime = new Date('2024-06-15T00:00:00');
    const day = (d: Date) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'full' }).format(d);
    return { wrong: day(dateOnly), right: day(dateTime) };
  });

  // ---------------------------------------------------------------------------
  // Trap 2 — months are zero-indexed
  // ---------------------------------------------------------------------------

  readonly zeroIndexedMonths = computed<BugDemo>(() => {
    const asWritten = new Date(2024, 6, 15); // reads like July? It IS July.
    const intended = new Date(2024, 5, 15); // June needs 5
    const fmt = (d: Date) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(d);
    return { wrong: fmt(asWritten), right: fmt(intended) };
  });

  // ---------------------------------------------------------------------------
  // Trap 3 — non-standard strings are implementation-defined
  // ---------------------------------------------------------------------------

  readonly nonStandardStrings = computed(() =>
    ['15-06-2024', '06/15/2024', '2024-06-15 12:00:00', 'June 15, 2024', '2024-6-15'].map(
      (input) => {
        const parsed = new Date(input);
        const valid = !Number.isNaN(parsed.getTime());
        return {
          input,
          valid,
          result: valid ? parsed.toISOString() : 'Invalid Date',
        };
      },
    ),
  );

  // ---------------------------------------------------------------------------
  // Trap 4 — two Dates are never equal
  // ---------------------------------------------------------------------------

  readonly equalityDemo = computed(() => {
    const a = new Date(2024, 5, 15, 10, 0, 0);
    const b = new Date(2024, 5, 15, 10, 0, 0);
    return {
      tripleEquals: a === b,
      doubleEquals: a == b,
      // Relational operators coerce to a number, so these DO work.
      lessThan: a < new Date(2024, 5, 16),
      getTimeEquals: a.getTime() === b.getTime(),
      // Subtraction coerces too, which is why this reads as 0.
      difference: Number(a) - Number(b),
    };
  });

  /** Rows for the equality table: expression, result, and whether it is reliable. */
  readonly equalityRows = computed(() => {
    const demo = this.equalityDemo();
    return [
      { expression: 'a === b', value: demo.tripleEquals, reliable: false },
      { expression: 'a == b', value: demo.doubleEquals, reliable: false },
      { expression: 'a < tomorrow', value: demo.lessThan, reliable: true },
      { expression: 'a.getTime() === b.getTime()', value: demo.getTimeEquals, reliable: true },
    ];
  });

  // ---------------------------------------------------------------------------
  // Trap 5 — every setter mutates in place
  // ---------------------------------------------------------------------------

  readonly mutationDemo = computed(() => {
    const original = new Date(2024, 0, 10);
    const aliased = original; // NOT a copy — same object
    aliased.setMonth(5);

    const pristine = new Date(2024, 0, 10);
    const copy = new Date(pristine); // a real copy
    copy.setMonth(5);

    const fmt = (d: Date) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(d);
    return {
      mutatedOriginal: fmt(original),
      safeOriginal: fmt(pristine),
      safeCopy: fmt(copy),
    };
  });

  // ---------------------------------------------------------------------------
  // Trap 6 — out-of-range values roll over silently
  // ---------------------------------------------------------------------------

  readonly rolloverDemo = computed(() =>
    [
      { expression: 'new Date(2024, 1, 30)', date: new Date(2024, 1, 30) },
      { expression: 'new Date(2024, 11, 32)', date: new Date(2024, 11, 32) },
      { expression: 'new Date(2024, 12, 1)', date: new Date(2024, 12, 1) },
      { expression: 'new Date(2023, 1, 29)', date: new Date(2023, 1, 29) },
    ].map(({ expression, date }) => ({
      expression,
      result: new Intl.DateTimeFormat('en-GB', { dateStyle: 'full' }).format(date),
    })),
  );

  // ---------------------------------------------------------------------------
  // Trap 7 — "a day" is not always 86_400_000 ms
  // ---------------------------------------------------------------------------

  /**
   * Fixed to America/New_York so the lesson is identical for every visitor:
   * 2024-03-10 is the spring-forward transition there, so that local day is
   * only 23 hours long.
   */
  readonly dstArithmetic = computed(() => {
    const zone = 'America/New_York';
    const start = new Date('2024-03-09T12:00:00-05:00');

    const addedMilliseconds = new Date(start.getTime() + 86_400_000);
    const addedCalendarDay = new Date(start);
    addedCalendarDay.setDate(addedCalendarDay.getDate() + 1);

    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        dateStyle: 'medium',
        timeStyle: 'long',
        hour12: false,
      }).format(d);

    return {
      zone,
      start: fmt(start),
      addedMilliseconds: fmt(addedMilliseconds),
      addedCalendarDay: fmt(addedCalendarDay),
    };
  });

  // ---------------------------------------------------------------------------
  // The built-in stringifiers
  // ---------------------------------------------------------------------------

  /**
   * `Date` ships nine stringifiers and not one of them takes a format pattern.
   * That gap is why the ecosystem grew a dozen formatting libraries — and why
   * `Intl.DateTimeFormat` exists.
   */
  readonly formatterOutputs = computed<FormatterOutput[]>(() => {
    const d = new Date(2024, 0, 23, 17, 23, 42);
    return [
      { method: 'toString()', output: d.toString(), basis: 'local' },
      { method: 'toDateString()', output: d.toDateString(), basis: 'local' },
      { method: 'toTimeString()', output: d.toTimeString(), basis: 'local' },
      { method: 'toLocaleString()', output: d.toLocaleString(), basis: 'local' },
      { method: 'toLocaleDateString()', output: d.toLocaleDateString(), basis: 'local' },
      { method: 'toLocaleTimeString()', output: d.toLocaleTimeString(), basis: 'local' },
      { method: 'toUTCString()', output: d.toUTCString(), basis: 'utc' },
      { method: 'toISOString()', output: d.toISOString(), basis: 'utc' },
      { method: 'toJSON()', output: d.toJSON(), basis: 'utc' },
    ];
  });

  // ---------------------------------------------------------------------------
  // Interactive explorer
  // ---------------------------------------------------------------------------

  readonly parsedDate = computed(() => {
    const d = new Date(this.inputDate());
    if (Number.isNaN(d.getTime())) {
      return { valid: false as const };
    }
    return {
      valid: true as const,
      timestamp: d.getTime(),
      toISOString: d.toISOString(),
      toString: d.toString(),
      toUTCString: d.toUTCString(),
      getHours: d.getHours(),
      getUTCHours: d.getUTCHours(),
      getMonth: d.getMonth(),
      getTimezoneOffset: d.getTimezoneOffset(),
    };
  });

  onInputChange(event: Event): void {
    this.inputDate.set((event.target as HTMLInputElement).value);
  }
}

/**
 * Zone-explicit date primitives.
 *
 * Every function here takes the IANA zone as an argument instead of relying on
 * the host's zone, which makes the whole module deterministic and testable from
 * any machine. That is the same discipline the app teaches: never let the
 * ambient zone leak into logic.
 *
 * The only primitive used underneath is `Intl.DateTimeFormat.formatToParts`.
 * Notably absent is the widespread trick of round-tripping through
 * `new Date(instant.toLocaleString('en-US', { timeZone }))` — that relies on
 * parsing a non-ISO string, which the spec does not require engines to support.
 * It yields fractional minutes on historical dates and throws `Invalid Date`
 * outright under a non-English locale.
 */

/** A wall-clock reading. Carries no zone and no instant on its own. */
export interface WallClock {
  readonly year: number;
  /** 1–12. One-based, unlike `Date`. */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/**
 * How to resolve a wall-clock reading that maps to zero or two instants,
 * mirroring `Temporal.ZonedDateTime`'s option of the same name.
 */
export type Disambiguation =
  /** Overlap: take the first pass. Gap: move forward past it. The default. */
  | 'compatible'
  /** Overlap: take the first pass. Gap: move backward before it. */
  | 'earlier'
  /** Overlap: take the second pass. Gap: move forward past it. */
  | 'later'
  /** Throw a `RangeError` rather than guess. */
  | 'reject';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * Constructing an `Intl.DateTimeFormat` is expensive relative to using one, and
 * these are called inside loops and reactive computations. Cache per zone.
 */
const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const namedFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      // `hourCycle: 'h23'` rather than `hour12: false`, which can report
      // midnight as hour 24 on some ICU builds.
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function zoneNameFormatter(
  timeZone: string,
  timeZoneName: 'short' | 'long' | 'longOffset' | 'shortOffset',
): Intl.DateTimeFormat {
  const key = `${timeZone}|${timeZoneName}`;
  let formatter = namedFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName });
    namedFormatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Milliseconds for a wall-clock reading treated as if it were UTC.
 *
 * Built with `setUTCFullYear` rather than `Date.UTC`, because `Date.UTC` maps
 * years 0–99 into the 1900s.
 */
function wallClockAsUtcMs(wall: WallClock): number {
  const date = new Date(0);
  date.setUTCFullYear(wall.year, wall.month - 1, wall.day);
  date.setUTCHours(wall.hour, wall.minute, wall.second, 0);
  return date.getTime();
}

function sameWallClock(a: WallClock, b: WallClock): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

// ---------------------------------------------------------------------------
// Instant -> wall clock
// ---------------------------------------------------------------------------

/** Reads an instant as a wall-clock reading in the given zone. */
export function wallClockIn(instant: Date, timeZone: string): WallClock {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) throw new Error(`Intl did not return a "${type}" part for ${timeZone}`);
    return Number(part.value);
  };

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

/**
 * The zone's offset at an instant, in signed minutes, where a positive number
 * means *ahead of* UTC.
 *
 * Note this is the opposite sign to `Date.prototype.getTimezoneOffset()`, which
 * reports minutes to add to reach UTC. This direction matches how offsets are
 * written everywhere else (`UTC+02:00`).
 *
 * Derived from the wall-clock parts rather than by parsing a `longOffset`
 * string, so it is always a whole number of minutes and stays consistent with
 * `wallClockIn`.
 */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const wall = wallClockIn(instant, timeZone);
  // Floor to whole seconds so any sub-second component cancels out.
  const flooredInstantMs = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((wallClockAsUtcMs(wall) - flooredInstantMs) / MINUTE_MS);
}

/** The offset at an instant as a `UTC±HH:MM` label. */
export function zoneOffsetLabel(instant: Date, timeZone: string): string {
  const minutes = zoneOffsetMinutes(instant, timeZone);
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const remainder = String(absolute % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${remainder}`;
}

/** The zone's short abbreviation at an instant, e.g. `EDT`. */
export function zoneAbbreviation(instant: Date, timeZone: string): string {
  const parts = zoneNameFormatter(timeZone, 'short').formatToParts(instant);
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
}

/** Formats an instant in an explicit zone. */
export function formatInZone(
  instant: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'long' },
  locale = 'en-GB',
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(instant);
}

// ---------------------------------------------------------------------------
// Wall clock -> instant  (the hard direction)
// ---------------------------------------------------------------------------

/**
 * Resolves a wall-clock reading in a zone to an actual instant.
 *
 * This is the direction that cannot be done by adding a cached offset, because
 * the offset that applies depends on the answer you are trying to compute. The
 * approach here probes the zone on both sides of any nearby transition, keeps
 * only the candidates that actually render back to the requested reading, and
 * then reports honestly how many there were:
 *
 * - exactly one: unambiguous.
 * - two: the reading falls in a repeated hour (clocks went back).
 * - none: the reading falls in a skipped hour (clocks went forward) and names a
 *   time that never existed in that zone.
 *
 * @throws RangeError when `disambiguation` is `'reject'` and the reading is
 *   either ambiguous or nonexistent.
 */
export function instantFromWallClock(
  wall: WallClock,
  timeZone: string,
  disambiguation: Disambiguation = 'compatible',
): Date {
  const targetMs = wallClockAsUtcMs(wall);

  // Probe a day either side so both the pre- and post-transition offsets are
  // seen even when the reading sits right on a boundary.
  const offsetBefore = zoneOffsetMinutes(new Date(targetMs - DAY_MS), timeZone);
  const offsetAfter = zoneOffsetMinutes(new Date(targetMs + DAY_MS), timeZone);

  const candidates = [...new Set([offsetBefore, offsetAfter])]
    .map((offset) => new Date(targetMs - offset * MINUTE_MS))
    .filter((candidate) => sameWallClock(wallClockIn(candidate, timeZone), wall))
    .sort((a, b) => a.getTime() - b.getTime());

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (candidates.length === 0) {
    // Skipped hour: the reading does not exist in this zone.
    if (disambiguation === 'reject') {
      throw new RangeError(
        `${describeWallClock(wall)} does not exist in ${timeZone} — the clocks moved forward.`,
      );
    }
    // Temporal semantics: `earlier` uses the post-transition offset and lands
    // before the gap; `compatible` and `later` use the pre-transition offset
    // and land after it.
    const offset = disambiguation === 'earlier' ? offsetAfter : offsetBefore;
    return new Date(targetMs - offset * MINUTE_MS);
  }

  // Repeated hour: two real instants share this reading.
  if (disambiguation === 'reject') {
    throw new RangeError(
      `${describeWallClock(wall)} is ambiguous in ${timeZone} — it occurs twice.`,
    );
  }
  return disambiguation === 'later' ? candidates[candidates.length - 1] : candidates[0];
}

/** How many instants a wall-clock reading maps to in a zone: 0, 1, or 2. */
export function countMatchingInstants(wall: WallClock, timeZone: string): 0 | 1 | 2 {
  const targetMs = wallClockAsUtcMs(wall);
  const offsetBefore = zoneOffsetMinutes(new Date(targetMs - DAY_MS), timeZone);
  const offsetAfter = zoneOffsetMinutes(new Date(targetMs + DAY_MS), timeZone);

  const matches = [...new Set([offsetBefore, offsetAfter])]
    .map((offset) => new Date(targetMs - offset * MINUTE_MS))
    .filter((candidate) => sameWallClock(wallClockIn(candidate, timeZone), wall));

  return matches.length as 0 | 1 | 2;
}

function describeWallClock(wall: WallClock): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)} ${pad(wall.hour)}:${pad(wall.minute)}`;
}

// ---------------------------------------------------------------------------
// Daylight saving introspection
// ---------------------------------------------------------------------------

/**
 * Signed minutes of difference between a zone's July and January offsets.
 *
 * Positive means the zone gains time in July (northern-hemisphere DST),
 * negative means it gains time in January (southern hemisphere), and zero means
 * the zone keeps one offset all year.
 *
 * Deliberately derived from tzdata rather than hardcoded, so it stays correct
 * as governments change the rules — and it does not assume the shift is an hour,
 * because for Australia/Lord_Howe it is thirty minutes.
 */
export function dstShiftMinutes(year: number, timeZone: string): number {
  const january = new Date(Date.UTC(year, 0, 15, 12));
  const july = new Date(Date.UTC(year, 6, 15, 12));
  return zoneOffsetMinutes(july, timeZone) - zoneOffsetMinutes(january, timeZone);
}

/**
 * Whether the zone changes offset at any point during the year.
 *
 * This deliberately does not call the change "DST": political one-off changes
 * look the same in tzdata. Sampling every UTC day also catches cases such as
 * Morocco's Ramadan suspension, where January and July have the same offset.
 */
export function hasOffsetChange(year: number, timeZone: string): boolean {
  const start = Date.UTC(year, 0, 1, 12);
  const end = Date.UTC(year + 1, 0, 1, 12);
  const firstOffset = zoneOffsetMinutes(new Date(start), timeZone);

  for (let instant = start + DAY_MS; instant < end; instant += DAY_MS) {
    if (zoneOffsetMinutes(new Date(instant), timeZone) !== firstOffset) {
      return true;
    }
  }

  return false;
}

/** Every IANA identifier this runtime knows, or `null` on older engines. */
export function supportedTimeZones(): readonly string[] | null {
  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  return supportedValuesOf ? supportedValuesOf('timeZone') : null;
}

/**
 * Resolves a zone identifier to the canonical spelling this runtime uses.
 *
 * tzdata carries decades of renames as aliases: `Asia/Calcutta` became
 * `Asia/Kolkata`, `Europe/Kiev` became `Europe/Kyiv`, `Asia/Katmandu` became
 * `Asia/Kathmandu`. Both spellings are accepted by `Intl`, but
 * Modern ECMA-402 requires `supportedTimeZones()` to return IANA primary
 * identifiers. Older ICU builds can still expose a legacy spelling, so code
 * crossing runtime boundaries should tolerate aliases.
 *
 * The practical consequence: never compare zone identifiers with `===`. A value
 * picked from `supportedTimeZones()` may not match the literal you hardcoded,
 * even though both name the same place. Compare canonical forms instead.
 */
export function canonicalTimeZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
}

/** Whether two identifiers name the same zone, tolerating alias spellings. */
export function isSameZone(a: string, b: string): boolean {
  return canonicalTimeZone(a) === canonicalTimeZone(b);
}

import { describe, expect, it } from 'vitest';

import {
  canonicalTimeZone,
  countMatchingInstants,
  dstShiftMinutes,
  formatInZone,
  instantFromWallClock,
  isSameZone,
  hasOffsetChange,
  supportedTimeZones,
  wallClockIn,
  zoneAbbreviation,
  zoneOffsetLabel,
  zoneOffsetMinutes,
  type WallClock,
} from './timezone';

/** Terse wall-clock builder, so the fixtures below stay readable. */
const at = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): WallClock => ({ year, month, day, hour, minute, second });

const NEW_YORK = 'America/New_York';

/**
 * The six fixture dates from the "Switch Timezone" page. Each one exists
 * because a naive implementation gets it wrong.
 */
describe('the six fixture dates', () => {
  it('2024-03-10 America/New_York — spring forward deletes an hour', () => {
    // 01:59:59 EST is immediately followed by 03:00:00 EDT.
    const before = new Date('2024-03-10T06:59:59Z');
    const after = new Date('2024-03-10T07:00:00Z');

    expect(zoneOffsetMinutes(before, NEW_YORK)).toBe(-300);
    expect(zoneOffsetMinutes(after, NEW_YORK)).toBe(-240);
    expect(wallClockIn(before, NEW_YORK).hour).toBe(1);
    expect(wallClockIn(after, NEW_YORK).hour).toBe(3);
  });

  it('2024-11-03 America/New_York — fall back repeats an hour', () => {
    const firstPass = new Date('2024-11-03T05:30:00Z');
    const secondPass = new Date('2024-11-03T06:30:00Z');

    // Two different instants, identical wall-clock reading.
    expect(wallClockIn(firstPass, NEW_YORK)).toEqual(at(2024, 11, 3, 1, 30));
    expect(wallClockIn(secondPass, NEW_YORK)).toEqual(at(2024, 11, 3, 1, 30));
    expect(zoneOffsetMinutes(firstPass, NEW_YORK)).toBe(-240);
    expect(zoneOffsetMinutes(secondPass, NEW_YORK)).toBe(-300);
  });

  it('2024 Australia/Lord_Howe — the DST shift is 30 minutes, not 60', () => {
    // Guards against `offset ± 3_600_000` assumptions.
    expect(dstShiftMinutes(2024, 'Australia/Lord_Howe')).toBe(-30);
    expect(Math.abs(dstShiftMinutes(2024, 'Australia/Lord_Howe'))).not.toBe(60);
  });

  it('2024 Australia/Sydney — the southern hemisphere is inverted', () => {
    // Negative shift means the zone gains time in January, not July.
    expect(dstShiftMinutes(2024, 'Australia/Sydney')).toBe(-60);
    expect(zoneOffsetMinutes(new Date('2024-01-15T12:00:00Z'), 'Australia/Sydney')).toBe(660);
    expect(zoneOffsetMinutes(new Date('2024-07-15T12:00:00Z'), 'Australia/Sydney')).toBe(600);
  });

  it('2024-06-15 Asia/Kathmandu — offsets are not whole hours', () => {
    const instant = new Date('2024-06-15T12:00:00Z');
    expect(zoneOffsetMinutes(instant, 'Asia/Kathmandu')).toBe(345);
    expect(zoneOffsetLabel(instant, 'Asia/Kathmandu')).toBe('UTC+05:45');
    expect(zoneOffsetMinutes(instant, 'Asia/Kathmandu') % 60).not.toBe(0);
  });

  it('2011-12-30 Pacific/Apia — a calendar day that never existed', () => {
    // Samoa jumped the date line; Friday 30 December 2011 has no instants.
    expect(countMatchingInstants(at(2011, 12, 30, 12), 'Pacific/Apia')).toBe(0);
    // The days either side are perfectly ordinary.
    expect(countMatchingInstants(at(2011, 12, 29, 12), 'Pacific/Apia')).toBe(1);
    expect(countMatchingInstants(at(2011, 12, 31, 12), 'Pacific/Apia')).toBe(1);
  });
});

describe('zoneOffsetMinutes', () => {
  it('is positive for zones ahead of UTC, unlike getTimezoneOffset()', () => {
    const instant = new Date('2024-06-15T12:00:00Z');
    expect(zoneOffsetMinutes(instant, 'Asia/Tokyo')).toBe(540);
    expect(zoneOffsetMinutes(instant, NEW_YORK)).toBe(-240);
    expect(zoneOffsetMinutes(instant, 'UTC')).toBe(0);
  });

  it('always returns a whole number of minutes, even for historical offsets', () => {
    // The string round-trip approach leaks fractional minutes here
    // (Seoul reported 507.8666… before this module existed).
    for (const zone of ['Asia/Seoul', 'Europe/Amsterdam', 'Europe/Dublin']) {
      const minutes = zoneOffsetMinutes(new Date('1850-01-01T12:00:00Z'), zone);
      expect(Number.isInteger(minutes), `${zone} produced ${minutes}`).toBe(true);
    }
  });

  it('reflects the rules in force on the date, not today’s rules', () => {
    // The US moved its DST start from April to March in 2007, so the same
    // calendar date sits on opposite sides of the boundary.
    expect(zoneOffsetMinutes(new Date('2006-03-12T12:00:00Z'), NEW_YORK)).toBe(-300);
    expect(zoneOffsetMinutes(new Date('2007-03-12T12:00:00Z'), NEW_YORK)).toBe(-240);
  });

  it('is unaffected by sub-second precision', () => {
    const whole = new Date('2024-06-15T12:00:00.000Z');
    const fractional = new Date('2024-06-15T12:00:00.999Z');
    expect(zoneOffsetMinutes(fractional, 'Asia/Kathmandu')).toBe(
      zoneOffsetMinutes(whole, 'Asia/Kathmandu'),
    );
  });
});

describe('zoneOffsetLabel', () => {
  it.each([
    ['UTC', 'UTC+00:00'],
    ['Asia/Tokyo', 'UTC+09:00'],
    ['Asia/Kolkata', 'UTC+05:30'],
    ['Asia/Kathmandu', 'UTC+05:45'],
    ['Australia/Eucla', 'UTC+08:45'],
    ['Pacific/Chatham', 'UTC+12:45'],
    ['Pacific/Kiritimati', 'UTC+14:00'],
    ['America/New_York', 'UTC-04:00'],
    ['Pacific/Marquesas', 'UTC-09:30'],
  ])('formats %s as %s in July 2024', (zone, expected) => {
    expect(zoneOffsetLabel(new Date('2024-07-15T12:00:00Z'), zone)).toBe(expected);
  });
});

describe('instantFromWallClock', () => {
  it('round-trips losslessly for unambiguous readings', () => {
    const zones = [
      'UTC',
      'America/New_York',
      'America/Argentina/Buenos_Aires',
      'Europe/Madrid',
      'Europe/London',
      'Asia/Kathmandu',
      'Asia/Tokyo',
      'Australia/Sydney',
      'Australia/Lord_Howe',
      'Pacific/Chatham',
      'Pacific/Kiritimati',
    ];
    const readings = [at(2024, 6, 15, 12), at(2024, 1, 15, 8, 30), at(2024, 9, 1, 23, 59, 59)];

    for (const zone of zones) {
      for (const reading of readings) {
        const instant = instantFromWallClock(reading, zone);
        expect(wallClockIn(instant, zone), `${zone} ${JSON.stringify(reading)}`).toEqual(reading);
      }
    }
  });

  describe('a skipped hour (clocks moved forward)', () => {
    const skipped = at(2024, 3, 10, 2, 30);

    it('matches no instant at all', () => {
      expect(countMatchingInstants(skipped, NEW_YORK)).toBe(0);
    });

    it('moves forward past the gap under "compatible"', () => {
      const resolved = instantFromWallClock(skipped, NEW_YORK, 'compatible');
      expect(resolved.toISOString()).toBe('2024-03-10T07:30:00.000Z');
      expect(wallClockIn(resolved, NEW_YORK)).toEqual(at(2024, 3, 10, 3, 30));
    });

    it('moves backward before the gap under "earlier"', () => {
      const resolved = instantFromWallClock(skipped, NEW_YORK, 'earlier');
      expect(resolved.toISOString()).toBe('2024-03-10T06:30:00.000Z');
      expect(wallClockIn(resolved, NEW_YORK)).toEqual(at(2024, 3, 10, 1, 30));
    });

    it('moves forward past the gap under "later"', () => {
      const resolved = instantFromWallClock(skipped, NEW_YORK, 'later');
      expect(resolved.toISOString()).toBe('2024-03-10T07:30:00.000Z');
      expect(wallClockIn(resolved, NEW_YORK)).toEqual(at(2024, 3, 10, 3, 30));
    });

    it('throws under "reject" instead of silently guessing', () => {
      expect(() => instantFromWallClock(skipped, NEW_YORK, 'reject')).toThrow(RangeError);
      expect(() => instantFromWallClock(skipped, NEW_YORK, 'reject')).toThrow(/does not exist/);
    });
  });

  describe('a repeated hour (clocks moved back)', () => {
    const repeated = at(2024, 11, 3, 1, 30);

    it('matches exactly two instants', () => {
      expect(countMatchingInstants(repeated, NEW_YORK)).toBe(2);
    });

    it('resolves to the first pass under "earlier"', () => {
      const resolved = instantFromWallClock(repeated, NEW_YORK, 'earlier');
      expect(resolved.toISOString()).toBe('2024-11-03T05:30:00.000Z');
      expect(zoneOffsetMinutes(resolved, NEW_YORK)).toBe(-240);
    });

    it('resolves to the second pass under "later"', () => {
      const resolved = instantFromWallClock(repeated, NEW_YORK, 'later');
      expect(resolved.toISOString()).toBe('2024-11-03T06:30:00.000Z');
      expect(zoneOffsetMinutes(resolved, NEW_YORK)).toBe(-300);
    });

    it('puts the two passes exactly one hour apart', () => {
      const earlier = instantFromWallClock(repeated, NEW_YORK, 'earlier');
      const later = instantFromWallClock(repeated, NEW_YORK, 'later');
      expect(later.getTime() - earlier.getTime()).toBe(3_600_000);
    });

    it('defaults to the earlier pass', () => {
      expect(instantFromWallClock(repeated, NEW_YORK).toISOString()).toBe(
        instantFromWallClock(repeated, NEW_YORK, 'earlier').toISOString(),
      );
    });

    it('throws under "reject"', () => {
      expect(() => instantFromWallClock(repeated, NEW_YORK, 'reject')).toThrow(/ambiguous/);
    });
  });

  it('handles the 30-minute Lord Howe transition', () => {
    // Lord Howe moves back 30 minutes, so the repeated window is half an hour.
    const repeated = at(2024, 4, 7, 1, 45);
    expect(countMatchingInstants(repeated, 'Australia/Lord_Howe')).toBe(2);

    const earlier = instantFromWallClock(repeated, 'Australia/Lord_Howe', 'earlier');
    const later = instantFromWallClock(repeated, 'Australia/Lord_Howe', 'later');
    expect(later.getTime() - earlier.getTime()).toBe(1_800_000);
  });

  it('never returns an Invalid Date', () => {
    for (const zone of ['UTC', NEW_YORK, 'Asia/Kathmandu', 'Pacific/Apia']) {
      for (const reading of [at(2024, 3, 10, 2, 30), at(2011, 12, 30, 12), at(2024, 6, 15, 12)]) {
        expect(Number.isNaN(instantFromWallClock(reading, zone).getTime())).toBe(false);
      }
    }
  });
});

describe('the conversion trap from the DST page', () => {
  /**
   * Reproduces the failure that motivates this module: a cached offset delta
   * is correct when captured and wrong when reused across a DST boundary.
   */
  it('shows a cached offset delta producing a one-hour error', () => {
    const seoul = 'Asia/Seoul';
    const captured = new Date(1_489_199_400_000); // 2017-03-11 11:30 in Seoul

    const capturedDelta =
      zoneOffsetMinutes(captured, seoul) - zoneOffsetMinutes(captured, NEW_YORK);
    expect(capturedDelta).toBe(840);

    // Five days later, New York has entered DST.
    const later = new Date('2017-03-15T12:00:00Z');
    const freshDelta = zoneOffsetMinutes(later, seoul) - zoneOffsetMinutes(later, NEW_YORK);
    expect(freshDelta).toBe(780);

    expect(capturedDelta - freshDelta).toBe(60);
  });

  it('is avoided entirely by resolving wall clocks per date', () => {
    // Asking for "the 15th at 21:30 in New York" needs no offset arithmetic.
    const resolved = instantFromWallClock(at(2017, 3, 15, 21, 30), NEW_YORK);
    expect(wallClockIn(resolved, NEW_YORK)).toEqual(at(2017, 3, 15, 21, 30));
    // And it lands on the post-transition offset, correctly.
    expect(zoneOffsetMinutes(resolved, NEW_YORK)).toBe(-240);
  });
});

describe('dstShiftMinutes / hasOffsetChange', () => {
  it.each([
    ['America/New_York', 60],
    ['Europe/Bucharest', 60],
    ['Europe/Madrid', 60],
    ['Australia/Sydney', -60],
    ['Australia/Lord_Howe', -30],
    ['Asia/Tokyo', 0],
    ['Asia/Kolkata', 0],
    ['America/Phoenix', 0],
  ])('reports %s as %i minutes in 2024', (zone, expected) => {
    expect(dstShiftMinutes(2024, zone)).toBe(expected);
  });

  it('does not assume every zone observes DST', () => {
    expect(hasOffsetChange(2024, 'Asia/Tokyo')).toBe(false);
    expect(hasOffsetChange(2024, 'America/New_York')).toBe(true);
  });

  it('detects that Iran abolished DST after 2022', () => {
    expect(hasOffsetChange(2021, 'Asia/Tehran')).toBe(true);
    expect(hasOffsetChange(2024, 'Asia/Tehran')).toBe(false);
  });

  it("detects Morocco's Ramadan suspension even when January and July match", () => {
    expect(dstShiftMinutes(2024, 'Africa/Casablanca')).toBe(0);
    expect(hasOffsetChange(2024, 'Africa/Casablanca')).toBe(true);
  });
});

describe('zoneAbbreviation', () => {
  it('changes across a DST boundary', () => {
    expect(zoneAbbreviation(new Date('2024-01-15T12:00:00Z'), NEW_YORK)).toBe('EST');
    expect(zoneAbbreviation(new Date('2024-07-15T12:00:00Z'), NEW_YORK)).toBe('EDT');
  });
});

describe('formatInZone', () => {
  it('renders one instant differently per zone without mutating it', () => {
    const instant = new Date('2024-06-15T12:00:00Z');
    const before = instant.getTime();

    const tokyo = formatInZone(instant, 'Asia/Tokyo', { timeStyle: 'short' });
    const newYork = formatInZone(instant, NEW_YORK, { timeStyle: 'short' });

    expect(tokyo).not.toBe(newYork);
    expect(instant.getTime()).toBe(before);
  });
});

describe('supportedTimeZones', () => {
  it('exposes a real IANA list rather than a hardcoded 24', () => {
    const zones = supportedTimeZones();
    expect(zones).not.toBeNull();
    expect(zones!.length).toBeGreaterThan(300);
    expect(zones).toContain('America/New_York');
  });

  /**
   * A gotcha discovered while writing these tests: the list contains only
   * *canonical* identifiers. Renamed zones are still perfectly usable under
   * their modern spelling, but that spelling may be absent from the list — and
   * which of the two spellings a given ICU build canonicalises to is not fixed.
   */
  it('omits alias spellings that nevertheless work', () => {
    const zones = supportedTimeZones()!;
    const aliasPairs = [
      ['Asia/Kolkata', 'Asia/Calcutta'],
      ['Europe/Kyiv', 'Europe/Kiev'],
      ['Asia/Kathmandu', 'Asia/Katmandu'],
    ] as const;

    for (const [modern, legacy] of aliasPairs) {
      // Both spellings are accepted by Intl...
      expect(() => zoneOffsetMinutes(new Date(), modern)).not.toThrow();
      expect(() => zoneOffsetMinutes(new Date(), legacy)).not.toThrow();
      // ...and they describe the same zone...
      expect(isSameZone(modern, legacy), `${modern} vs ${legacy}`).toBe(true);
      expect(zoneOffsetMinutes(new Date(), modern)).toBe(zoneOffsetMinutes(new Date(), legacy));
      // ...but exactly one of them is in the canonical list.
      expect(
        Number(zones.includes(modern)) + Number(zones.includes(legacy)),
        `expected exactly one canonical spelling of ${modern}/${legacy}`,
      ).toBe(1);
    }
  });

  it('canonicalises idempotently, so canonical forms are safe to compare', () => {
    for (const zone of ['Asia/Kolkata', 'Europe/Kyiv', 'America/New_York', 'UTC']) {
      const once = canonicalTimeZone(zone);
      expect(canonicalTimeZone(once)).toBe(once);
    }
  });

  it('warns against comparing zone identifiers with ===', () => {
    // This is why `isSameZone` exists.
    expect(isSameZone('Asia/Kolkata', 'Asia/Calcutta')).toBe(true);
    expect(isSameZone('Asia/Kolkata', 'Asia/Tokyo')).toBe(false);
  });

  it('accepts every zone the app hardcodes in its own lists', () => {
    const used = [
      'UTC',
      'America/New_York',
      'America/Los_Angeles',
      'America/Argentina/Buenos_Aires',
      'America/Sao_Paulo',
      'America/Phoenix',
      'America/Santiago',
      'Europe/London',
      'Europe/Madrid',
      'Europe/Bucharest',
      'Asia/Tokyo',
      'Asia/Kolkata',
      'Asia/Kathmandu',
      'Asia/Seoul',
      'Asia/Pyongyang',
      'Asia/Tehran',
      'Asia/Shanghai',
      'Australia/Sydney',
      'Australia/Lord_Howe',
      'Australia/Eucla',
      'Pacific/Auckland',
      'Pacific/Chatham',
      'Pacific/Apia',
      'Pacific/Kiritimati',
      'Africa/Cairo',
    ];

    for (const zone of used) {
      expect(() => zoneOffsetLabel(new Date(), zone), `${zone} is not usable`).not.toThrow();
    }
  });
});

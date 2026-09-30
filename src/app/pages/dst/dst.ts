import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  dstShiftMinutes,
  formatInZone,
  zoneOffsetLabel,
  zoneOffsetMinutes,
} from '../../core/timezone';

/** A zone's behaviour across the year, derived live from the runtime's tzdata. */
interface DstProfile {
  readonly zone: string;
  readonly label: string;
  readonly januaryOffset: string;
  readonly julyOffset: string;
  /** Signed minutes of difference between the July and January offsets. */
  readonly shiftMinutes: number;
  readonly verdict: string;
  readonly kind: 'none' | 'northern' | 'southern' | 'partial';
}

/** A non-whole-hour offset, to break the "24 tidy zones" mental model. */
interface OddOffset {
  readonly zone: string;
  readonly place: string;
  readonly offset: string;
  readonly note: string;
}

/** Evidence that a region's rules changed at some point in history. */
interface HistoricalChange {
  readonly title: string;
  readonly summary: string;
  readonly rows: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  readonly lesson: string;
}

@Component({
  selector: 'app-dst',
  imports: [RouterLink],
  templateUrl: './dst.html',
  styleUrl: './dst.scss',
})
export class Dst {
  readonly localTimezone = signal(Intl.DateTimeFormat().resolvedOptions().timeZone);

  // ---------------------------------------------------------------------------
  // The two DST anomalies: a gap and an overlap
  // ---------------------------------------------------------------------------

  /**
   * Spring forward in America/New_York, 2024-03-10. The local clock jumps
   * 01:59:59 -> 03:00:00, so no wall-clock reading between 02:00 and 02:59
   * exists on that date. Asking for one does not throw — it silently slides.
   */
  readonly springForward = computed(() => {
    const zone = 'America/New_York';
    const before = new Date('2024-03-10T06:59:00Z');
    const after = new Date('2024-03-10T07:00:00Z');
    const requested = new Date('2024-03-10T02:30:00-05:00');

    return {
      zone,
      before: formatInZone(before, zone),
      after: formatInZone(after, zone),
      // A local string naming a time inside the gap.
      requestedInput: '2024-03-10T02:30:00 (local)',
      resolvedTo: formatInZone(new Date(requested.getTime()), zone),
      lostHour: '02:00 – 02:59',
    };
  });

  /**
   * Fall back in America/New_York, 2024-11-03. The local clock repeats
   * 01:00–01:59, so "01:30" names two different instants one hour apart. A
   * local string alone cannot say which — the information is simply absent.
   */
  readonly fallBack = computed(() => {
    const zone = 'America/New_York';
    const firstPass = new Date('2024-11-03T01:30:00-04:00'); // still EDT
    const secondPass = new Date('2024-11-03T01:30:00-05:00'); // now EST

    return {
      zone,
      firstWall: formatInZone(firstPass, zone),
      firstIso: firstPass.toISOString(),
      secondWall: formatInZone(secondPass, zone),
      secondIso: secondPass.toISOString(),
      gapHours: (secondPass.getTime() - firstPass.getTime()) / 3_600_000,
      repeatedHour: '01:00 – 01:59',
    };
  });

  // ---------------------------------------------------------------------------
  // DST is not one hour, and not always in "summer"
  // ---------------------------------------------------------------------------

  /**
   * Computed from the runtime's own tzdata rather than hardcoded, so the verdict
   * stays correct even as governments change the rules under us.
   */
  readonly dstProfiles = computed<DstProfile[]>(() => {
    const zones: ReadonlyArray<readonly [string, string]> = [
      ['Europe/Bucharest', 'Bucharest'],
      ['Europe/London', 'London'],
      ['America/New_York', 'New York'],
      ['America/Phoenix', 'Phoenix'],
      ['Australia/Sydney', 'Sydney'],
      ['Australia/Lord_Howe', 'Lord Howe Island'],
      ['Asia/Tokyo', 'Tokyo'],
      ['Asia/Kolkata', 'Kolkata'],
      ['America/Santiago', 'Santiago'],
      ['Asia/Tehran', 'Tehran'],
    ];

    return zones.map(([zone, label]) => {
      const january = new Date('2024-01-15T12:00:00Z');
      const july = new Date('2024-07-15T12:00:00Z');
      const shiftMinutes = dstShiftMinutes(2024, zone);

      let kind: DstProfile['kind'];
      let verdict: string;

      if (shiftMinutes === 0) {
        kind = 'none';
        verdict = 'No DST — one offset all year';
      } else if (shiftMinutes > 0) {
        kind = 'northern';
        verdict = `+${describeShift(shiftMinutes)} in July (northern summer)`;
      } else {
        kind = 'southern';
        verdict = `+${describeShift(-shiftMinutes)} in January (southern summer)`;
      }

      // Anything other than a clean hour gets its own emphasis, because that is
      // the case most code gets wrong.
      if (shiftMinutes !== 0 && Math.abs(shiftMinutes) !== 60) {
        kind = 'partial';
      }

      return {
        zone,
        label,
        januaryOffset: zoneOffsetLabel(january, zone),
        julyOffset: zoneOffsetLabel(july, zone),
        shiftMinutes,
        verdict,
        kind,
      };
    });
  });

  // ---------------------------------------------------------------------------
  // Offsets are not whole hours either
  // ---------------------------------------------------------------------------

  readonly oddOffsets = computed<OddOffset[]>(() => {
    const entries: ReadonlyArray<readonly [string, string, string]> = [
      ['Asia/Kolkata', 'India', 'One offset for a country spanning ~28° of longitude'],
      ['Asia/Kathmandu', 'Nepal', 'Deliberately 15 minutes off India'],
      ['Australia/Eucla', 'Eucla, Australia', 'A settlement of a few dozen people'],
      ['Pacific/Chatham', 'Chatham Islands, NZ', '45 minutes past its neighbour'],
      ['Asia/Shanghai', 'China', 'Five geographic slices, one offset'],
      ['Pacific/Kiritimati', 'Kiritimati, Kiribati', 'The furthest-ahead clock on Earth'],
    ];

    const reference = new Date('2024-07-15T12:00:00Z');
    return entries.map(([zone, place, note]) => ({
      zone,
      place,
      offset: zoneOffsetLabel(reference, zone),
      note,
    }));
  });

  // ---------------------------------------------------------------------------
  // Zones are political, and they change
  // ---------------------------------------------------------------------------

  readonly historicalChanges = computed<HistoricalChange[]>(() => {
    const nyOn = (iso: string) => zoneOffsetLabel(new Date(iso), 'America/New_York');
    const apiaDay = (iso: string) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Pacific/Apia',
        dateStyle: 'full',
      }).format(new Date(iso));

    return [
      {
        title: 'The United States moved its DST dates in 2007',
        summary:
          'The Energy Policy Act of 2005 shifted the start of DST from April to March. The same calendar date now falls on opposite sides of the boundary depending on the year.',
        rows: [
          { label: '12 March 2006', value: nyOn('2006-03-12T12:00:00Z') },
          { label: '12 March 2007', value: nyOn('2007-03-12T12:00:00Z') },
          { label: '2 April 2006', value: nyOn('2006-04-02T12:00:00Z') },
        ],
        lesson:
          'A correct conversion needs the rules that were in force on the date in question — not the rules in force today.',
      },
      {
        title: 'Samoa deleted a day to change sides of the date line',
        summary:
          'In December 2011 Samoa jumped from UTC-11:00 to UTC+13:00 to trade more easily with Australia and New Zealand. Friday 30 December 2011 simply never happened there.',
        rows: [
          { label: 'instant 2011-12-29T12:00Z', value: apiaDay('2011-12-29T12:00:00Z') },
          { label: 'instant 2011-12-30T12:00Z', value: apiaDay('2011-12-30T12:00:00Z') },
          { label: 'instant 2011-12-31T12:00Z', value: apiaDay('2011-12-31T12:00:00Z') },
        ],
        lesson:
          'Local calendars are not continuous. Iterating "day by day" through a date range can skip or repeat a day.',
      },
      {
        title: 'Same offset today, different history',
        summary:
          'Seoul and Tokyo are both UTC+09:00 right now. They are separate IANA zones because their pasts diverge — Korea used UTC+09:30 in the 1950s and ran DST during the 1988 Olympics.',
        rows: [
          {
            label: '1955 · Seoul / Tokyo',
            value: `${zoneOffsetLabel(new Date('1955-06-01T12:00:00Z'), 'Asia/Seoul')} / ${zoneOffsetLabel(new Date('1955-06-01T12:00:00Z'), 'Asia/Tokyo')}`,
          },
          {
            label: '1988 · Seoul / Tokyo',
            value: `${zoneOffsetLabel(new Date('1988-06-01T12:00:00Z'), 'Asia/Seoul')} / ${zoneOffsetLabel(new Date('1988-06-01T12:00:00Z'), 'Asia/Tokyo')}`,
          },
          {
            label: '2024 · Seoul / Tokyo',
            value: `${zoneOffsetLabel(new Date('2024-06-01T12:00:00Z'), 'Asia/Seoul')} / ${zoneOffsetLabel(new Date('2024-06-01T12:00:00Z'), 'Asia/Tokyo')}`,
          },
        ],
        lesson:
          'You cannot collapse zones by their current offset. The offset is a reading; the zone is the whole rulebook.',
      },
      {
        title: 'North Korea changed its standard time twice in three years',
        summary:
          'Pyongyang moved to UTC+08:30 in 2015 and back to UTC+09:00 in 2018. Not DST — a change of standard time, for political reasons.',
        rows: [
          {
            label: '2016',
            value: zoneOffsetLabel(new Date('2016-06-01T12:00:00Z'), 'Asia/Pyongyang'),
          },
          {
            label: '2024',
            value: zoneOffsetLabel(new Date('2024-06-01T12:00:00Z'), 'Asia/Pyongyang'),
          },
        ],
        lesson:
          'tzdata is a moving target. Keep it patched — a stale copy silently produces wrong times.',
      },
    ];
  });

  // ---------------------------------------------------------------------------
  // getTimezoneOffset() has an inverted sign
  // ---------------------------------------------------------------------------

  readonly offsetSign = computed(() => {
    const now = new Date();
    const minutes = now.getTimezoneOffset();
    return {
      minutes,
      readsAs:
        minutes === 0 ? 'UTC+00:00' : minutes < 0 ? 'a zone AHEAD of UTC' : 'a zone BEHIND UTC',
      trueOffset: zoneOffsetLabel(now, this.localTimezone()),
      // The negation you must remember.
      corrected: -minutes,
    };
  });

  // ---------------------------------------------------------------------------
  // The headline trap: you cannot convert zones by adding an offset
  // ---------------------------------------------------------------------------

  /**
   * Reproduces the failure case from the TOAST UI write-up with real tzdata.
   * A user in Seoul views a Seoul appointment as New York time, edits the day
   * from the 10th to the 15th, and the app converts back using the offset delta
   * it captured earlier. DST started on 12 March, so that delta is now stale
   * and the answer is an hour out.
   */
  readonly conversionTrap = computed(() => {
    const seoul = 'Asia/Seoul';
    const newYork = 'America/New_York';
    const instant = new Date(1_489_199_400_000); // 2017-03-11T11:30 in Seoul

    const capturedDelta = zoneOffsetMinutes(instant, seoul) - zoneOffsetMinutes(instant, newYork);

    // Shift the timestamp so UTC getters read as if they were New York getters.
    const shifted = new Date(instant.getTime() - capturedDelta * 60_000);
    const edited = new Date(shifted);
    edited.setUTCDate(15); // the user picks the 15th

    const revertedWithStaleDelta = new Date(edited.getTime() + capturedDelta * 60_000);

    const freshDelta =
      zoneOffsetMinutes(new Date('2017-03-15T12:00:00Z'), seoul) -
      zoneOffsetMinutes(new Date('2017-03-15T12:00:00Z'), newYork);
    const revertedWithFreshDelta = new Date(edited.getTime() + freshDelta * 60_000);

    return {
      originalSeoul: formatInZone(instant, seoul),
      originalNewYork: formatInZone(instant, newYork),
      capturedDelta,
      freshDelta,
      wrong: formatInZone(revertedWithStaleDelta, newYork),
      right: formatInZone(revertedWithFreshDelta, newYork),
      errorMinutes: (revertedWithStaleDelta.getTime() - revertedWithFreshDelta.getTime()) / 60_000,
    };
  });
}

/** Renders a DST shift as a compact duration, e.g. `1h` or `0h30m`. */
function describeShift(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

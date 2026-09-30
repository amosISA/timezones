import { Component, computed, effect, signal } from '@angular/core';

import { formatInZone, wallClockIn, zoneOffsetLabel } from '../../core/timezone';

/** One of the 24 hour-wide slices drawn around the globe diagram. */
interface ZoneWedge {
  /** Whole-hour UTC offset this wedge represents, e.g. -3, 0, 9. */
  readonly offset: number;
  /** Short label rendered inside the wedge, e.g. "+9", "0", "−3". */
  readonly label: string;
  /** SVG path describing the pie slice. */
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
  /** True when this wedge matches the visitor's current offset. */
  readonly isUserZone: boolean;
  /** True for UTC+0 — the Greenwich reference meridian. */
  readonly isPrimeMeridian: boolean;
}

/** A town in the "before standardisation" illustration. */
interface SolarTown {
  readonly name: string;
  readonly clock: string;
  readonly note: string;
}

/** A city rendered in the "one instant, many clocks" strip. */
interface CityClock {
  readonly city: string;
  readonly timeZone: string;
  readonly time: string;
  readonly offset: string;
  readonly dayLabel: string;
  readonly isDaytime: boolean;
}

@Component({
  selector: 'app-why-timezones',
  templateUrl: './why-timezones.html',
  styleUrl: './why-timezones.scss',
})
export class WhyTimezones {
  // --- Globe diagram geometry -------------------------------------------------
  private static readonly CENTER_X = 200;
  private static readonly CENTER_Y = 200;
  private static readonly RADIUS = 170;
  private static readonly LABEL_RADIUS = 138;

  readonly centerX = WhyTimezones.CENTER_X;
  readonly centerY = WhyTimezones.CENTER_Y;
  readonly radius = WhyTimezones.RADIUS;

  /**
   * Approximate local solar times for the same instant, before Britain
   * standardised on Greenwich time. Held as a stable reference so the template
   * does not rebuild the array on every change detection run.
   */
  readonly solarTowns: readonly SolarTown[] = [
    { name: 'Penzance', clock: '11:38', note: 'further west, sun later' },
    { name: 'Bristol', clock: '11:50', note: '' },
    { name: 'London', clock: '12:00', note: 'sun overhead here' },
  ];

  readonly standardisedTowns: readonly string[] = ['Penzance', 'Bristol', 'London'];

  // --- Live state -------------------------------------------------------------
  readonly currentInstant = signal(new Date());
  readonly localTimezone = signal(Intl.DateTimeFormat().resolvedOptions().timeZone);

  /**
   * Minutes returned by `Date.prototype.getTimezoneOffset()`.
   * Note the inverted sign: a zone *ahead* of UTC reports a *negative* number.
   */
  readonly currentOffset = computed(() => this.currentInstant().getTimezoneOffset());

  readonly offsetHours = computed(() => {
    const offset = this.currentOffset();
    const hours = Math.floor(Math.abs(offset) / 60);
    const minutes = Math.abs(offset) % 60;
    const sign = offset <= 0 ? '+' : '-';
    return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  });

  readonly utcNow = computed(() => this.currentInstant().toISOString());

  /** Visitor's offset in whole hours, used to highlight a wedge. */
  private readonly userOffsetHours = computed(() => Math.round(-this.currentOffset() / 60));

  /**
   * The 24 hour-wide wedges, laid out clockwise from the top of the circle.
   * UTC+0 sits at 12 o'clock, so eastward offsets run down the right-hand side
   * and westward offsets run down the left — the same way a world map reads.
   */
  readonly zoneWedges = computed<ZoneWedge[]>(() => {
    const userOffset = this.userOffsetHours();
    const wedges: ZoneWedge[] = [];

    for (let index = 0; index < 24; index++) {
      // index 0..12 -> UTC+0..+12, index 13..23 -> UTC-11..-1
      const offset = index <= 12 ? index : index - 24;
      const centerAngle = index * 15;
      const label = WhyTimezones.polar(WhyTimezones.LABEL_RADIUS, centerAngle);

      wedges.push({
        offset,
        label: WhyTimezones.formatOffsetLabel(offset),
        path: WhyTimezones.wedgePath(centerAngle - 7.5, centerAngle + 7.5),
        labelX: label.x,
        labelY: label.y,
        isUserZone: offset === userOffset,
        isPrimeMeridian: offset === 0,
      });
    }

    return wedges;
  });

  /**
   * Every clock below is formatted from the *same* millisecond value. Nothing
   * about the instant changes — only the zone used to render it.
   */
  readonly cityClocks = computed<CityClock[]>(() => {
    const instant = this.currentInstant();

    const cities: ReadonlyArray<readonly [string, string]> = [
      ['Los Angeles', 'America/Los_Angeles'],
      ['Buenos Aires', 'America/Argentina/Buenos_Aires'],
      ['London', 'Europe/London'],
      ['Bucharest', 'Europe/Bucharest'],
      ['Kolkata', 'Asia/Kolkata'],
      ['Tokyo', 'Asia/Tokyo'],
    ];

    return cities.map(([city, timeZone]) => {
      const wall = wallClockIn(instant, timeZone);
      const pad = (value: number) => String(value).padStart(2, '0');

      return {
        city,
        timeZone,
        time: `${pad(wall.hour)}:${pad(wall.minute)}`,
        offset: zoneOffsetLabel(instant, timeZone),
        dayLabel: formatInZone(instant, timeZone, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
        isDaytime: wall.hour >= 6 && wall.hour < 19,
      };
    });
  });

  constructor() {
    effect((onCleanup) => {
      const interval = setInterval(() => this.currentInstant.set(new Date()), 1000);
      onCleanup(() => clearInterval(interval));
    });
  }

  // --- Geometry helpers -------------------------------------------------------

  /**
   * Converts an angle measured clockwise from the top of the circle into SVG
   * coordinates. SVG's y-axis grows downward, hence the -90° rotation.
   */
  private static polar(radius: number, angleDegrees: number): { x: number; y: number } {
    const radians = ((angleDegrees - 90) * Math.PI) / 180;
    return {
      x: WhyTimezones.CENTER_X + radius * Math.cos(radians),
      y: WhyTimezones.CENTER_Y + radius * Math.sin(radians),
    };
  }

  private static wedgePath(startAngle: number, endAngle: number): string {
    const start = WhyTimezones.polar(WhyTimezones.RADIUS, startAngle);
    const end = WhyTimezones.polar(WhyTimezones.RADIUS, endAngle);
    const r = WhyTimezones.RADIUS;
    // sweep-flag 1 = clockwise, large-arc-flag 0 = the 15° span is under 180°.
    return [
      `M ${WhyTimezones.CENTER_X} ${WhyTimezones.CENTER_Y}`,
      `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
      `A ${r} ${r} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
      'Z',
    ].join(' ');
  }

  private static formatOffsetLabel(offset: number): string {
    if (offset === 0) return '0';
    // U+2212 MINUS SIGN reads better than a hyphen at small sizes.
    return offset > 0 ? `+${offset}` : `\u2212${Math.abs(offset)}`;
  }
}

import { Component, computed, effect, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import {
  countMatchingInstants,
  formatInZone,
  instantFromWallClock,
  wallClockIn,
  zoneAbbreviation,
  zoneOffsetLabel,
  type WallClock,
} from '../../core/timezone';

interface ClockRow {
  readonly timezone: string;
  readonly localTime: string;
  readonly offset: string;
  readonly abbreviation: string;
  readonly isDaytime: boolean;
}

interface ConversionResult {
  readonly sourceTime: string;
  readonly targetTime: string;
  readonly utcTime: string;
  readonly sourceOffset: string;
  readonly targetOffset: string;
  /** How many real instants the requested source reading maps to: 0, 1 or 2. */
  readonly matchingInstants: 0 | 1 | 2;
}

@Component({
  selector: 'app-playground',
  imports: [DatePipe],
  templateUrl: './playground.html',
  styleUrl: './playground.scss',
})
export class Playground {
  readonly currentTime = signal(new Date());
  readonly customIsoInput = signal('');
  readonly parsedCustomDate = signal<Date | null>(null);
  readonly parseError = signal('');

  readonly selectedSourceTz = signal('UTC');
  readonly selectedTargetTz = signal('America/New_York');
  readonly conversionInput = signal('14:30');

  /** Held as a stable reference so the template does not rebuild it each cycle. */
  readonly parserExamples: readonly string[] = [
    '2024-06-15T14:30:00Z',
    '2024-06-15T14:30:00+05:30',
    '2024-06-15T14:30:00',
    '2024-06-15',
    'June 15, 2024 14:30',
    '06/15/2024',
  ];

  readonly timezones = signal([
    'UTC',
    'America/New_York',
    'America/Los_Angeles',
    'America/Chicago',
    'America/Denver',
    'America/Argentina/Buenos_Aires',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Madrid',
    'Europe/Moscow',
    'Asia/Tokyo',
    'Asia/Kolkata',
    'Asia/Kathmandu',
    'Asia/Shanghai',
    'Asia/Dubai',
    'Australia/Sydney',
    'Australia/Lord_Howe',
    'Pacific/Auckland',
    'Pacific/Chatham',
    'Africa/Cairo',
    'Africa/Johannesburg',
  ]);

  readonly worldClock = computed<ClockRow[]>(() => {
    const now = this.currentTime();

    return this.timezones().map((timezone) => {
      const wall = wallClockIn(now, timezone);
      const pad = (value: number) => String(value).padStart(2, '0');

      return {
        timezone,
        localTime: `${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`,
        offset: zoneOffsetLabel(now, timezone),
        abbreviation: zoneAbbreviation(now, timezone),
        isDaytime: wall.hour >= 6 && wall.hour < 20,
      };
    });
  });

  /**
   * Converts a wall-clock time between zones.
   *
   * The naive way to do this is to shift the timestamp by the offset difference
   * between the two zones. That is the exact bug documented on the DST page: the
   * offset you capture stops being the offset that applies. Instead this
   * resolves the requested reading against the source zone's rules for that
   * specific date, and reports when the reading is nonexistent or ambiguous
   * rather than silently picking an instant.
   */
  readonly conversionResult = computed<ConversionResult | null>(() => {
    const [hour, minute] = this.conversionInput().split(':').map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

    const sourceZone = this.selectedSourceTz();
    const targetZone = this.selectedTargetTz();

    // Anchor to today's calendar date *as seen in the source zone*, not the
    // host zone — those can differ by a day.
    const today = wallClockIn(this.currentTime(), sourceZone);
    const requested: WallClock = {
      year: today.year,
      month: today.month,
      day: today.day,
      hour,
      minute,
      second: 0,
    };

    const instant = instantFromWallClock(requested, sourceZone);

    return {
      sourceTime: formatInZone(instant, sourceZone, {
        dateStyle: 'medium',
        timeStyle: 'short',
        hour12: false,
      }),
      targetTime: formatInZone(instant, targetZone, {
        dateStyle: 'medium',
        timeStyle: 'short',
        hour12: false,
      }),
      utcTime: instant.toISOString(),
      sourceOffset: zoneOffsetLabel(instant, sourceZone),
      targetOffset: zoneOffsetLabel(instant, targetZone),
      matchingInstants: countMatchingInstants(requested, sourceZone),
    };
  });

  constructor() {
    effect((onCleanup) => {
      const interval = setInterval(() => this.currentTime.set(new Date()), 1000);
      onCleanup(() => clearInterval(interval));
    });
  }

  selectExample(example: string): void {
    this.customIsoInput.set(example);
    this.parse(example);
  }

  onCustomIsoInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.customIsoInput.set(value);
    this.parse(value);
  }

  onConversionInputChange(event: Event): void {
    this.conversionInput.set((event.target as HTMLInputElement).value);
  }

  onSourceTzChange(event: Event): void {
    this.selectedSourceTz.set((event.target as HTMLSelectElement).value);
  }

  onTargetTzChange(event: Event): void {
    this.selectedTargetTz.set((event.target as HTMLSelectElement).value);
  }

  private parse(value: string): void {
    if (!value.trim()) {
      this.parseError.set('');
      this.parsedCustomDate.set(null);
      return;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      // Note the constructor does not throw — it returns a Date holding NaN.
      this.parseError.set(`Invalid Date — this engine could not parse "${value}".`);
      this.parsedCustomDate.set(null);
      return;
    }

    this.parseError.set('');
    this.parsedCustomDate.set(parsed);
  }
}

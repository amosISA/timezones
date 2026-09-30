import { Component, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-intl-api',
  imports: [RouterLink],
  templateUrl: './intl-api.html',
  styleUrl: './intl-api.scss',
})
export class IntlApi {
  readonly selectedTimezone = signal('America/New_York');
  readonly selectedLocale = signal('en-US');
  readonly referenceDate = signal(new Date());

  readonly availableTimezones = signal([
    'America/New_York',
    'America/Los_Angeles',
    'America/Chicago',
    'America/Argentina/Buenos_Aires',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Madrid',
    'Asia/Tokyo',
    'Asia/Kolkata',
    'Asia/Shanghai',
    'Australia/Sydney',
    'Pacific/Auckland',
    'Africa/Cairo',
    'America/Sao_Paulo',
  ]);

  readonly availableLocales = signal([
    'en-US',
    'en-GB',
    'es-AR',
    'es-ES',
    'de-DE',
    'fr-FR',
    'ja-JP',
    'zh-CN',
    'pt-BR',
    'ar-EG',
  ]);

  readonly formattedExamples = computed(() => {
    const date = this.referenceDate();
    const tz = this.selectedTimezone();
    const locale = this.selectedLocale();

    return {
      dateTimeFull: new Intl.DateTimeFormat(locale, {
        timeZone: tz,
        dateStyle: 'full',
        timeStyle: 'long',
      }).format(date),

      dateOnly: new Intl.DateTimeFormat(locale, {
        timeZone: tz,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date),

      timeOnly: new Intl.DateTimeFormat(locale, {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      }).format(date),

      relative: this.getRelativeTime(date),

      parts: new Intl.DateTimeFormat(locale, {
        timeZone: tz,
        dateStyle: 'full',
        timeStyle: 'long',
      }).formatToParts(date),
    };
  });

  readonly multiTimezoneComparison = computed(() => {
    const date = this.referenceDate();
    const locale = this.selectedLocale();
    return this.availableTimezones().map((tz) => ({
      timezone: tz,
      time: new Intl.DateTimeFormat(locale, {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(date),
    }));
  });

  onTimezoneChange(event: Event): void {
    this.selectedTimezone.set((event.target as HTMLSelectElement).value);
  }

  onLocaleChange(event: Event): void {
    this.selectedLocale.set((event.target as HTMLSelectElement).value);
  }

  private getRelativeTime(date: Date): string {
    const rtf = new Intl.RelativeTimeFormat(this.selectedLocale(), {
      numeric: 'auto',
    });
    const diffMs = date.getTime() - Date.now();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (Math.abs(diffHours) < 1) {
      const diffMinutes = Math.round(diffMs / (1000 * 60));
      return rtf.format(diffMinutes, 'minute');
    }
    return rtf.format(diffHours, 'hour');
  }
}

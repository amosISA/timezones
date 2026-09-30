import { Component, computed, effect, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { supportedTimeZones, zoneAbbreviation } from '../../core/timezone';
import { CodeBlock } from '../../shared/code-block';
import type { CodeLanguage } from '../../shared/shiki-highlighter';

/** A runnable snippet shown inside a platform guide. */
interface Snippet {
  readonly label: string;
  readonly code: string;
  readonly language?: CodeLanguage;
  readonly note?: string;
}

/** Instructions for changing the timezone on one platform or tool. */
interface Guide {
  readonly id: string;
  readonly platform: string;
  readonly icon: string;
  readonly tagline: string;
  readonly scope: string;
  readonly restartRequired: string;
  readonly steps: readonly string[];
  readonly snippets: readonly Snippet[];
  readonly gotcha?: string;
}

@Component({
  selector: 'app-switch-timezone',
  imports: [CodeBlock, RouterLink],
  templateUrl: './switch-timezone.html',
  styleUrl: './switch-timezone.scss',
})
export class SwitchTimezone {
  readonly currentInstant = signal(new Date());

  /** Which snippet was most recently copied, for the aria-live confirmation. */
  readonly copiedCode = signal<string | null>(null);

  /**
   * Best-effort platform guess, used only to highlight the most likely guide.
   * `navigator.platform` is deprecated, so this reads the user-agent string and
   * degrades to no highlight when it cannot tell.
   */
  readonly detectedPlatform = signal<'mac' | 'windows' | 'linux' | null>(
    SwitchTimezone.detectPlatform(),
  );

  // ---------------------------------------------------------------------------
  // Live verification panel — the feedback loop for everything on this page
  // ---------------------------------------------------------------------------

  readonly resolved = computed(() => {
    const instant = this.currentInstant();
    const options = Intl.DateTimeFormat().resolvedOptions();
    const offsetMinutes = instant.getTimezoneOffset();
    const hours = Math.floor(Math.abs(offsetMinutes) / 60);
    const minutes = Math.abs(offsetMinutes) % 60;

    return {
      timeZone: options.timeZone,
      locale: options.locale,
      offset: `UTC${offsetMinutes <= 0 ? '+' : '-'}${String(hours).padStart(2, '0')}:${String(
        minutes,
      ).padStart(2, '0')}`,
      offsetMinutes,
      wallClock: new Intl.DateTimeFormat(undefined, {
        dateStyle: 'full',
        timeStyle: 'long',
      }).format(instant),
      iso: instant.toISOString(),
      zoneAbbreviation: zoneAbbreviation(instant, options.timeZone),
    };
  });

  /** How many IANA identifiers this runtime's tzdata actually contains. */
  readonly knownZoneCount = computed(() => supportedTimeZones()?.length ?? null);

  constructor() {
    effect((onCleanup) => {
      const interval = setInterval(() => this.currentInstant.set(new Date()), 1000);
      onCleanup(() => clearInterval(interval));
    });
  }

  // ---------------------------------------------------------------------------
  // The guides
  // ---------------------------------------------------------------------------

  readonly devToolsGuide: Guide = {
    id: 'devtools',
    platform: 'Chrome DevTools',
    icon: '🛠️',
    tagline: 'The fastest option — no OS change, no restart',
    scope: 'The inspected tab only',
    restartRequired: 'No',
    steps: [
      'Open DevTools, then press Cmd+Shift+P (macOS) or Ctrl+Shift+P (Windows/Linux) to open the Command Menu.',
      'Type "sensors" and choose "Show Sensors". The panel opens in the drawer at the bottom.',
      'In the Location section, pick a preset such as Tokyo. For a reusable custom city with its own timezone and locale, open DevTools Settings → Locations and add a preset there.',
      'Select the location in Sensors, then reload the page. Date, Intl, geolocation and locale-aware APIs in that inspected page now use the emulated environment.',
    ],
    snippets: [
      {
        label: 'Verify it took effect (paste in the Console)',
        code: 'Intl.DateTimeFormat().resolvedOptions().timeZone',
        language: 'javascript',
        note: 'Should print the zone you selected, e.g. Asia/Tokyo',
      },
    ],
    gotcha:
      'Location presets override the locale as well as the timezone, so date formatting changes shape too. That is realistic, but if you only meant to test the zone, remember both moved. The override also disappears when you close DevTools.',
  };

  readonly cairoVerificationCode = `const resolved = Intl.DateTimeFormat().resolvedOptions();
console.table({
  timeZone: resolved.timeZone,
  locale: resolved.locale,
  localTime: new Date().toString(),
  offsetMinutes: new Date().getTimezoneOffset(),
});`;

  readonly osGuides: readonly Guide[] = [
    {
      id: 'mac',
      platform: 'macOS',
      icon: '🍎',
      tagline: 'System-wide, affects every app',
      scope: 'The whole machine',
      restartRequired: 'Restart the browser',
      steps: [
        'Open System Settings → General → Date & Time.',
        'Turn off "Set time zone automatically using your current location". macOS will not let you pick a zone while this is on.',
        'Click the Time Zone field and choose a city, or use the closest match on the map.',
        'Quit and reopen your browser, then check the panel at the top of this page.',
      ],
      snippets: [
        {
          label: 'List every zone the system accepts',
          code: 'sudo systemsetup -listtimezones',
        },
        {
          label: 'Set the zone from the terminal',
          code: 'sudo systemsetup -settimezone America/New_York',
          note: 'Uses IANA names directly. Much faster than the GUI for repeated switching.',
        },
        {
          label: 'Read the current zone back',
          code: 'sudo systemsetup -gettimezone',
        },
      ],
      gotcha:
        'The automatic-location toggle will silently reset your zone later if you leave it on. Turn it off for the duration of your testing, and remember to turn it back on.',
    },
    {
      id: 'windows',
      platform: 'Windows 11 / 10',
      icon: '🪟',
      tagline: 'System-wide, uses Microsoft zone names',
      scope: 'The whole machine',
      restartRequired: 'Restart the browser',
      steps: [
        'Open Settings → Time & language → Date & time.',
        'Turn off "Set time zone automatically".',
        'Pick a zone from the Time zone dropdown.',
        'Restart your browser and check the panel above.',
      ],
      snippets: [
        {
          label: 'List available zones (Command Prompt)',
          code: 'tzutil /l',
          language: 'powershell',
        },
        {
          label: 'Set the zone (Command Prompt)',
          code: 'tzutil /s "Eastern Standard Time"',
          language: 'powershell',
          note: 'Note the Microsoft name — not America/New_York.',
        },
        {
          label: 'PowerShell equivalent',
          code: 'Set-TimeZone -Id "Tokyo Standard Time"',
          language: 'powershell',
        },
        {
          label: 'Read the current zone (PowerShell)',
          code: 'Get-TimeZone',
          language: 'powershell',
        },
      ],
      gotcha:
        'Windows uses its own identifiers and rule representation, such as "Eastern Standard Time", rather than IANA names. Unicode CLDR maintains mappings between them. Browsers expose IANA identifiers through Intl, while native and .NET APIs may use Windows identifiers.',
    },
    {
      id: 'linux',
      platform: 'Linux',
      icon: '🐧',
      tagline: 'One command, IANA names, no GUI needed',
      scope: 'The whole machine',
      restartRequired: 'Restart the browser',
      steps: [
        'Use timedatectl from any terminal — it is part of systemd, so it is present on most modern distributions.',
        'Restart your browser and check the panel above.',
      ],
      snippets: [
        {
          label: 'List zones (pipe to grep to narrow it down)',
          code: 'timedatectl list-timezones | grep America',
        },
        {
          label: 'Set the zone',
          code: 'sudo timedatectl set-timezone America/New_York',
        },
        {
          label: 'Read the current state',
          code: 'timedatectl status',
        },
      ],
      gotcha:
        'If timedatectl is unavailable, symlink /etc/localtime to the zone file instead: sudo ln -sf /usr/share/zoneinfo/America/New_York /etc/localtime',
    },
  ];

  readonly processGuides: readonly Guide[] = [
    {
      id: 'tz-env',
      platform: 'The TZ environment variable',
      icon: '📦',
      tagline: 'Per-process, no system change — ideal for Node and test runners',
      scope: 'A single process and its children',
      restartRequired: 'N/A — set it when you launch',
      steps: [
        'Prefix a Node or test command with TZ=<IANA name>. That process starts with the requested default zone.',
        'For browser code, change the browser itself with DevTools Sensors or launch a genuinely new browser process with TZ. Changing only the Angular dev-server process does not change an already-running browser.',
      ],
      snippets: [
        {
          label: 'Run Node-side Angular tests in another zone',
          code: 'TZ=America/New_York pnpm test',
          note: 'This affects the Node test process. It does not change the timezone of a separate browser tab.',
        },
        {
          label: 'Launch Chrome itself in another zone (macOS)',
          code: 'TZ=Asia/Tokyo open -na "Google Chrome" --args --user-data-dir=/tmp/tz-test',
          note: 'The separate user-data-dir forces a fresh process, so the new TZ is actually picked up.',
        },
        {
          label: 'Launch Chrome in another zone (Linux)',
          code: 'TZ=Asia/Tokyo google-chrome --user-data-dir=/tmp/tz-test',
        },
        {
          label: 'One-off check in Node',
          code: 'TZ=Pacific/Chatham node -e "console.log(new Date().toString())"',
        },
      ],
      gotcha:
        'Set TZ before the process starts. Node documents runtime TZ assignment on current POSIX and Windows releases, but startup configuration is easier to reason about and avoids values created before the change.',
    },
    {
      id: 'tests',
      platform: 'Automated tests',
      icon: '🧪',
      tagline: 'Pin the zone so a green suite means something',
      scope: 'The test run',
      restartRequired: 'N/A',
      steps: [
        'Pin a zone explicitly rather than inheriting the developer machine. A suite that passes in Madrid and fails in São Paulo is not a suite.',
        'Then add a second run in a zone with DST and a zone without, so transition bugs surface in CI rather than in production.',
      ],
      snippets: [
        {
          label: 'Vitest / Jest — pin the zone in the script',
          code: '"test": "TZ=UTC vitest --run"',
          language: 'json',
          note: 'UTC is the right default: it has no DST, so failures are about your logic.',
        },
        {
          label: 'Playwright — per-context, no env var needed',
          code: "const context = await browser.newContext({ timezoneId: 'America/New_York' });",
          language: 'typescript',
          note: 'Can differ per test, which makes cross-zone assertions genuinely easy.',
        },
        {
          label: 'Playwright config — apply to every project',
          code: "use: { timezoneId: 'America/New_York', locale: 'en-US' }",
          language: 'typescript',
        },
        {
          label: 'Cypress — set it before the runner boots',
          code: 'TZ=Australia/Lord_Howe cypress run',
          note: 'Cypress has no per-test zone option; it inherits the process zone.',
        },
        {
          label: 'Docker — install tzdata when you rely on TZ',
          code: 'RUN apk add --no-cache tzdata\nENV TZ=UTC',
          language: 'dockerfile',
          note: 'Node bundles full ICU, so Intl with an explicit timeZone works without this. It is the TZ variable — the process default zone — that needs the platform zoneinfo files.',
        },
      ],
      gotcha:
        'Be precise about what a slim image actually breaks. An explicit `Intl.DateTimeFormat({ timeZone })` keeps working, because Node carries its own ICU copy of tzdata, and an unrecognised zone name throws a RangeError rather than falling back to UTC. What can silently end up wrong is the process default zone when TZ cannot be resolved. Pin zones explicitly in code and the base image stops mattering.',
    },
  ];

  /** Dates worth adding to any test fixture set, with why they matter. */
  readonly testDates: ReadonlyArray<{
    readonly date: string;
    readonly zone: string;
    readonly why: string;
  }> = [
    {
      date: '2024-03-10',
      zone: 'America/New_York',
      why: 'Spring forward — 02:00–02:59 does not exist',
    },
    {
      date: '2024-11-03',
      zone: 'America/New_York',
      why: 'Fall back — 01:00–01:59 happens twice',
    },
    {
      date: '2024-04-07',
      zone: 'Australia/Lord_Howe',
      why: 'A 30-minute DST shift, not 60',
    },
    {
      date: '2024-01-15',
      zone: 'Australia/Sydney',
      why: 'Southern hemisphere — on DST in January',
    },
    {
      date: '2024-06-15',
      zone: 'Asia/Kathmandu',
      why: 'A :45 offset, to catch hour-only assumptions',
    },
    {
      date: '2011-12-30',
      zone: 'Pacific/Apia',
      why: 'A calendar day that never existed',
    },
  ];

  // ---------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------

  async copy(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.copiedCode.set(code);
      setTimeout(() => {
        // Only clear if nothing else was copied in the meantime.
        if (this.copiedCode() === code) {
          this.copiedCode.set(null);
        }
      }, 2000);
    } catch {
      // Clipboard access can be denied; failing silently is fine here because
      // the code is visible and selectable on screen anyway.
    }
  }

  // ---------------------------------------------------------------------------
  // Static helpers
  // ---------------------------------------------------------------------------

  private static detectPlatform(): 'mac' | 'windows' | 'linux' | null {
    if (typeof navigator === 'undefined') return null;
    const agent = navigator.userAgent;
    if (/Mac|iPhone|iPad/.test(agent)) return 'mac';
    if (/Win/.test(agent)) return 'windows';
    if (/Linux|X11/.test(agent)) return 'linux';
    return null;
  }
}

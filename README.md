# The Hour That Doesn't Exist

![Angular dates and time zones illustrated with clocks and a calendar](public/dates_timezones_angular.jpg)

An Angular 22 zoneless teaching app about JavaScript dates, IANA time zones, daylight-saving transitions, Angular `DatePipe`, testing across zones, and the path to Temporal.

The application is intentionally interactive: examples run in the visitor's runtime so it is clear which behavior comes from ECMAScript, Angular, ICU/tzdb, or the host environment.

## Companion article

This repository is the interactive companion to [The Hour That Doesn’t Exist](https://www.codigotipado.com/p/the-hour-that-doesnt-exist), a practical field guide to dates, time zones, and the Angular APIs that can produce surprising results.

The article provides the narrative and explanations; this application lets you run the examples, inspect edge cases, and experiment with the concepts in your own browser.

## What is verified

The technical content was rechecked on **16 September 2026** against:

- ECMAScript and ECMA-402 specifications
- Angular **22.1.4** documentation and `format_date.ts` source
- IANA tzdb documentation and NIST time-history material
- TC39 Temporal specification and implementation-status page
- Node, Chrome DevTools, Playwright, and HTML documentation
- npm package metadata and a dated weekly-download snapshot

The in-app **Sources** page links every primary source used by the teaching content.

Package versions and download counts are snapshots, not permanent claims. Browser and runtime support is feature-detected where possible.

## Shiki

Code examples use [Shiki](https://shiki.style/) 4.4.3. The highlighter is loaded only when a code block needs it, and token text is rendered through Angular interpolation rather than injected with `innerHTML`.

Relevant files:

- `src/app/shared/shiki-highlighter.ts` — languages, theme, and lazy highlighter setup
- `src/app/shared/code-block.ts` — safe Angular token renderer with a plain-text fallback

## Run locally

```bash
pnpm install
pnpm start
```

Open `http://localhost:4200`.

## Verification

```bash
pnpm test
pnpm test:zones
pnpm build
```

- `pnpm test` pins the Node test runtime to UTC.
- `pnpm test:zones` reruns the suite in UTC, New York, Kathmandu, Kiritimati, and Lord Howe.
- Browser timezone emulation belongs in DevTools Sensors or a browser automation context; changing only the Angular dev-server process does not change an existing browser tab.

## Important scope notes

- `Date` stores an instant, not an IANA zone.
- Angular `DatePipe` can format local time or fixed offsets, but Angular 22.1.4 does not resolve IANA regional rules from values such as `America/New_York`.
- IANA data is versioned. Old runtimes can have stale rules, and pre-1970 historical coverage varies.
- Temporal is Stage 4, but support must still be checked in the actual runtime matrix.

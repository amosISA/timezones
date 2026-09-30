# The Hour That Doesn't Exist

### A field guide to dates, timezones, and the Angular APIs that quietly lie to you

---

At 2:30 in the morning on the tenth of March, 2024, a nightly job in New York did not run.

It hadn't been deleted. Nobody had touched the schedule. The cron expression was fine, the container was healthy, the logs from the ninth were clean and the logs from the eleventh were clean. There was simply no 2:30 that night in that city. The clocks went from 01:59:59 straight to 03:00:00, and the thirty minutes past two never happened.

I've watched engineers spend a full day on that class of bug. Not because it's hard, exactly, but because every instinct you have points the wrong way. You check the scheduler. You check the container. You add logging. Eventually somebody says "wait, isn't that daylight saving weekend?" and the whole thing collapses into embarrassment.

The reason it's hard is that we all carry a mental model of time that is wrong in a specific way, and no error message ever contradicts it. So I want to take that model apart, put it back together correctly, and then get specific about Angular — because Angular has a date formatting API that I have watched confuse very good developers, and I recently discovered it's worse than I thought. I'll get to that. I had it wrong myself, in writing, and I'll show you the receipts.

---

## Part one: a Date object wraps a time value

Let's start with the thing everyone half-knows.

`new Date()` returns an object, not a number. The object's essential instance-specific state is a numeric **time value**: milliseconds since midnight UTC on the first of January, 1970, or `NaN` for an invalid date.

> **What does “midnight UTC” mean?** Midnight is `00:00:00`, the first moment of a calendar day. UTC is the shared reference clock, so **midnight UTC** means `00:00:00` on that clock — not midnight wherever you happen to be. The Unix epoch is written `1970-01-01T00:00:00Z`; the `Z` says the offset from UTC is zero. At that same instant it was 01:00 in Madrid and 19:00 on the previous day in New York.

That object does not store an IANA timezone such as `Europe/Madrid`, a locale, or a selectable calendar. The `GMT+0200` text you see in the console is a representation produced from the stored time value using the host's current timezone rules. Most of the confusion in this topic lives in the gap between the stored instant and the representation shown to a person.

```js
const d = new Date('2024-07-15T12:00:00Z');
d.getTime(); // 1721044800000  — the numeric time value stored by the object
d.toISOString(); // '2024-07-15T12:00:00.000Z'
d.toString(); // depends entirely on the machine you run it on
```

That last line is the important one. `toString()` does not read a stored timezone from the object. It asks the host environment for its local timezone rules, applies the relevant offset, and renders the result. Run it in Madrid and you get 14:00. Run it in Los Angeles and you get 05:00. Same number. Same object. Different string.

Two operations, then, and both of them happen _outside_ the `Date`:

**Parsing** turns text into the number. A timezone is involved, and if the text doesn't specify one, something else decides.

**Formatting** turns the number back into text. A timezone is involved again, and if you don't specify one, the host decides.

Every date bug you will ever write is at one of those two boundaries. Once you genuinely internalise that — not "yeah I know that" but actually reach for it when debugging — this whole topic becomes tractable.

---

## Part two: why any of this exists

Skip this if you like, but I think the history earns its keep, because the design decision that created timezones is the same decision that keeps biting us.

Before the middle of the nineteenth century, every town kept its own time, set by the sun. Noon was when the sun sat highest over _that town_. Since the sun can't be directly overhead in two places at once, no two towns agreed, and nobody cared, because nothing moved fast enough for the disagreement to matter. A stagecoach doesn't need a timetable accurate to the minute.

Railways broke that. A schedule has to be readable in two towns at once. A train leaving Bristol at 11:30 arrived in London at 11:20, because Bristol's clocks genuinely were about ten minutes behind, and now you can't print a timetable.

Standard time spread through railways and national systems during the nineteenth century. In 1884, delegates from twenty-five nations met in Washington and adopted the Greenwich meridian as the prime meridian and a universal day. They did **not** legislate today's timezone boundaries. Twenty-four one-hour bands are a useful geometric model; governments draw the real boundaries and exceptions.

That trade is the whole story. **A timezone deliberately sacrifices astronomical accuracy to buy a name that many people can agree on.** The sun is no longer overhead at noon anywhere except the exact centre of your band, and we accepted that, because a shared name is worth more than an accurate one.

Hold onto it, because it explains the shape of everything that follows: you are always holding either _a moment in time_ or _a name humans use for it_, and those are different kinds of thing.

---

## Part three: an offset is not a timezone

Here's where most codebases go wrong, and it's usually in the type definitions.

New York is `UTC-05:00`. Except from March to November, when it's `UTC-04:00`. And the dates it switches between them changed in 2007, when the US moved the start of daylight saving from April to March. So the sentence "New York's timezone is UTC-05:00" isn't imprecise, it's a category error, in the same way that "my address is my house key" is a category error.

The relationship is **one zone to many offsets**, and which offset applies depends on _when_.

DongWoo Kim puts it well in [a write-up of adding timezone support to the TOAST UI Calendar](https://toastui.medium.com/handling-time-zone-in-javascript-547e67aa842d): you can't say "New York's timezone is EST". You have to say New York is _currently_ observing EST, under the rules in force today. It reads like pedantry right up until it costs you an hour.

I like to check this against the actual database rather than trust my memory. Same calendar date, one year apart:

```js
const offset = (iso, zone) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(iso))
    .find((p) => p.type === 'timeZoneName').value;

offset('2006-03-12T12:00:00Z', 'America/New_York'); // 'GMT-05:00'
offset('2007-03-12T12:00:00Z', 'America/New_York'); // 'GMT-04:00'
```

Twelfth of March, both years, and the offset differs, because the law changed in between. Your runtime knows this. It carries the history.

Which is the whole reason IANA identifiers exist. `America/New_York` isn't a label for an offset — it's a key into [a maintained database](https://www.iana.org/time-zones) of civil-time rules. The location part is deliberately a _city_ rather than a country, on the reasoning that cities outlive states. Historical coverage varies, especially before 1970, and future rules can change; your runtime only knows the tzdb release it ships.

Two consequences worth writing on a sticky note:

**Never store an offset and reuse it for another date.** It was a reading taken at one instant. It is not a property of the place.

**Never assume the tidy twenty-four-band model.** India runs on `+05:30`. Nepal picked `+05:45`, fifteen minutes off its enormous neighbour, apparently on purpose. Eucla, a settlement in Australia with a population you could fit in a bus, uses `+08:45`. The Chatham Islands are on `+12:45`. If your timezone picker is a dropdown of twenty-four hour values, it's wrong, and there are people who cannot use your software because of it.

While we're here: the shift isn't always an hour, either. Lord Howe Island moves its clocks by **thirty minutes**. Any code that adds or subtracts `3600000` on a transition is broken there. And in Sydney and Santiago the whole thing is inverted — they're on daylight saving in January. "Summer time" is not a range of months.

---

## Part four: the traps, briefly

You've probably met some of these. I'm going quickly because the Angular section is where I actually want to spend our time — and because [Zell Liew already wrote the definitive tour of them](https://css-tricks.com/everything-you-need-to-know-about-date-in-javascript/) on CSS-Tricks, which is where I'd send anyone who wants each one at length. What follows is the compressed version, with the timezone consequences pulled forward.

**The shape of the string changes the rule.** This is the big one, and it is not a browser quirk — it's specified behaviour.

```js
new Date('2024-06-15'); // date-only  → parsed as UTC midnight
new Date('2024-06-15T00:00:00'); // date-time  → parsed as LOCAL midnight
```

Two strings that look like siblings, following opposite rules. In any zone west of Greenwich, the first one renders as the fourteenth of June. That's the off-by-one-day bug that shows up in every date picker ever shipped, and it has a nasty property: it's _invisible_ to a developer in Madrid or Warsaw or Tokyo and breaks for every user in the Americas. It reaches production because the person who wrote it could not see it.

**Months count from zero.** `new Date(2024, 6, 15)` is the fifteenth of July. Inherited from Java, thirty years ago, and now permanent. Every other field in that constructor is one-based. Just the month isn't.

**Anything outside the specified formats is a coin flip.** ECMAScript requires its Date Time String Format plus invariants for strings produced by `toString()` and `toUTCString()`; it does not generally promise RFC 2822 parsing. [MDN warns against relying on other formats](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse) because they are implementation-defined and engines disagree. `new Date('2024-06-15 12:00:00')` — an ISO date-time with a space instead of the `T` — parses happily on V8 and has historically returned `Invalid Date` elsewhere. It works on your machine. That's not the same as working.

**Two identical Dates are never equal.** `a === b` compares object identity, so it's false. But `a < b` coerces to a number, so _that_ works. You simply have to remember the inconsistency. Compare with `getTime()`.

**Every setter mutates.** `d.setMonth(5)` changes `d` in place and returns a timestamp. Assigning a `Date` to another variable copies the reference, so mutating through one name changes both. Copy first: `new Date(original)`.

**Out-of-range values roll over silently.** `new Date(2024, 1, 30)` is the first of March. Useful for arithmetic, catastrophic for validation, because a user typing "February 31" gets a valid March date and no error.

**A day is not 86,400,000 milliseconds.** Take noon in New York on the ninth of March, 2024, and add exactly twenty-four hours of milliseconds. You land on 13:00, not 12:00, because the local day in between was only twenty-three hours long. Add a _calendar_ day instead — `setDate(getDate() + 1)` — and you keep 12:00 but only twenty-three hours of real time elapse.

Neither is wrong. They answer different questions. "Remind me in twenty-four hours" wants the first. "Remind me tomorrow at noon" wants the second. The bug is not knowing which one you asked for.

---

## Part five: the gap and the overlap

These two deserve their own section because they're the ones that produce genuinely unrecoverable data loss, and most developers have never thought about the second one at all.

**Spring forward deletes an hour.** In New York on the tenth of March, 2024, the local clock jumped from 01:59:59 to 03:00:00. No wall-clock reading between 02:00 and 02:59 exists on that date. Ask for one and nothing throws:

```js
// TZ=America/New_York
new Date('2024-03-10T02:30:00').toString();
// → 'Sun Mar 10 2024 03:30:00 GMT-0400'
```

You asked for 02:30. You got 03:30. Silently. That's our missing cron job.

**Fall back repeats an hour, and this one is worse.** On the third of November, 2024, New York's clocks went back, so 01:00 through 01:59 happened _twice_. "01:30" names two different instants, one hour apart:

```js
new Date('2024-11-03T01:30:00-04:00').toISOString(); // '2024-11-03T05:30:00.000Z'
new Date('2024-11-03T01:30:00-05:00').toISOString(); // '2024-11-03T06:30:00.000Z'
```

Identical wall-clock text. An hour apart in reality. And here's the part that matters: **a local timestamp cannot tell you which one it was.** The information isn't ambiguous, it's _absent_.

Which means storing `2024-11-03 01:30:00` in a database column with no offset destroys information permanently. No amount of later processing recovers it. If you sort logs by a local timestamp, they go out of order once a year, and there is no fix short of re-collecting the data.

Store instants. An epoch integer, or an ISO string with an explicit offset. If what the user _meant_ was a wall-clock time — "the standup is at 09:00 in Bucharest, every day, forever" — then store the wall-clock time **and the IANA zone name**, and resolve it to an instant at the moment you need one. An offset alone won't reproduce it next year.

---

## Part six: you already have a timezone library

Before we get to Angular: most applications that install a date library needed one function, and it's built into the platform.

`Intl.DateTimeFormat` can render any instant in any IANA zone in any locale, it's backed by the runtime's own copy of the tz database, and it costs zero bytes.

```js
const instant = new Date('2024-07-15T12:00:00Z');

new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kathmandu',
  dateStyle: 'full',
  timeStyle: 'long',
}).format(instant);
// 'Monday 15 July 2024 at 17:45:00 GMT+5:45'
```

Note `+5:45`, handled correctly, with no dependency and no configuration.

`formatToParts()` is the underrated half of the API. It hands you the pieces as objects so you can pull out exactly one:

```js
new Intl.DateTimeFormat('en-US', {
  timeZone: 'Australia/Lord_Howe',
  timeZoneName: 'longOffset',
})
  .formatToParts(instant)
  .find((p) => p.type === 'timeZoneName').value;
// 'GMT+10:30'
```

That's how you get an arbitrary zone's offset at an arbitrary instant, which the `Date` API cannot do at all — `getTimezoneOffset()` only ever describes the host's own zone, and it reports the _opposite_ sign to how offsets are written everywhere else. New York in June returns `240`, positive, despite New York being behind UTC. I have no defence for this. Memorise it.

One more, for building a zone picker properly:

```js
Intl.supportedValuesOf('timeZone').length; // 418 on the runtime I'm writing on
```

Four hundred and eighteen, not twenty-four.

There is a compatibility trap in that list. Current ECMA-402 requires primary IANA identifiers, but older engines and ICU snapshots can expose legacy aliases such as `Asia/Calcutta` or `Europe/Kiev`. Modern spellings can still work in `DateTimeFormat` even when an older list returns an alias. If you support those runtimes, compare the identifiers after canonicalising them rather than comparing raw strings.

Compare canonical forms:

```js
const canonical = (zone) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;

canonical('Asia/Kolkata') === canonical('Asia/Calcutta'); // true
```

---

## Part seven: Angular

Right. This is the part I actually wanted to write, and it's where I have to eat something.

### What I got wrong

I have written, in a published document, that Angular's `DatePipe` delegates to `Intl` under the hood. It's a natural assumption — `Intl` is right there, it's correct, and it handles zones properly. Lots of people believe it. I did.

It's false. Here's the check:

```bash
$ grep -c "Intl.DateTimeFormat" node_modules/@angular/common/fesm2022/common.mjs
0
```

Zero. `@angular/common` doesn't touch `Intl.DateTimeFormat` at all. Angular ships its **own** locale data — that's what `registerLocaleData` and the `@angular/common/locales/*` files are for — and its own formatting engine built on `getLocaleDateFormat`, `getLocaleMonthNames` and friends.

Which is a defensible design. It predates good `Intl` support, it makes output identical across engines, and it works under AOT with a known bundle cost. Fine.

But it has a consequence that I don't think is widely understood, and it's bad.

### The timezone parameter does not accept timezones

Everything in this section is pinned to Angular's **v22.1.4 tag**, not to a moving `main` branch. Angular's own `DatePipe.transform` documentation calls this argument [“a timezone offset (such as `'+0430'`)”](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/pipes/date_pipe.ts#L231-L244), and the implementation [passes that value directly to `formatDate`](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/pipes/date_pipe.ts#L263-L278).

`DatePipe` takes that value as its third template argument. You've seen this:

```html
{{ myDate | date: 'medium' : 'America/New_York' }}
```

Here's how Angular resolves that string. This is the actual implementation, lightly trimmed from [`timezoneToOffset` in Angular's source](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/i18n/format_date.ts#L891-L897):

```ts
function timezoneToOffset(timezone, fallback) {
  timezone = timezone.replace(/:/g, '');
  const requestedTimezoneOffset = Date.parse('Jan 01, 1970 00:00:00 ' + timezone) / 60000;
  return isNaN(requestedTimezoneOffset) ? fallback : requestedTimezoneOffset;
}
```

Read it slowly. It concatenates your string onto a date literal and hands the result to `Date.parse`. So it works for things `Date.parse` understands as a trailing zone designator — `'UTC'`, `'GMT'`, `'+0530'`, `'-0400'`.

`Date.parse('Jan 01, 1970 00:00:00 America/New_York')` is `NaN`.

And when it's `NaN`, the function returns `fallback`. We can trace where that value comes from without taking anyone's word for it: [`formatDate` initializes the fallback with `date.getTimezoneOffset()`](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/i18n/format_date.ts#L119-L123), then [`timezoneToOffset` returns that fallback when `Date.parse` produces `NaN`](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/i18n/format_date.ts#L891-L897). That is the host's own offset. No exception is thrown, so `DatePipe`'s [catch-and-wrap error path](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/pipes/date_pipe.ts#L271-L278) never runs.

I ran this with the host zone pinned to Los Angeles, formatting an instant that is 08:00 in New York:

```
host zone               : America/Los_Angeles
formatDate(…, 'America/New_York')  →  2024-07-15 05:00 -07:00
formatDate(…)  (no zone at all)    →  2024-07-15 05:00 -07:00
Intl, for America/New_York         →  15/07/2024, 08:00:00 GMT-4
```

Asking for New York produced Los Angeles time. Three hours wrong. Byte-identical to passing no timezone at all.

If an Angular app feeds IANA names from a timezone dropdown directly into `DatePipe`, Angular's v22.1.4 implementation does not resolve those regional rules. It shows every user their own local time with a label claiming otherwise. That is a worse failure than crashing, because nobody files a bug against a page that looks plausible.

I know this because I built exactly that page, in an app whose entire purpose is teaching people about timezones. It looked great. It was lying.

### And the offsets it does accept are frozen

Use a numeric offset and it parses. But it is a fixed number, applied to every instant. The source does exactly that arithmetic in [`convertTimezoneToLocal`](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/i18n/format_date.ts#L899-L910):

```
formatDate(2024-01-15T12:00:00Z, 'HH:mm', 'en-US', '-0500')  →  07:00
formatDate(2024-07-15T12:00:00Z, 'HH:mm', 'en-US', '-0500')  →  07:00

Intl, America/New_York, January                              →  07:00
Intl, America/New_York, July                                 →  08:00
```

January is right. July is an hour out, because New York is on `-04:00` in July and you told Angular `-05:00`.

This is the "never cache an offset" rule from part three, except the framework's public API is shaped around fixed offsets. The evidence is in Angular's own JSDoc: the `DatePipe.transform` parameter is documented with [`'+0430'`](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/pipes/date_pipe.ts#L231-L244), while the `DATE_PIPE_DEFAULT_OPTIONS` example uses [`'-1200'`](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/pipes/date_pipe.ts#L26-L59). Those are offsets, not IANA zone identifiers. The property is named `timezone`, but its documented contract is narrower than that name suggests.

**So: if you need to display a date in a specific timezone, do not use `DatePipe` for it.** Use `Intl.DateTimeFormat`. This is one of the few places where I'd tell you to reach past the framework without hesitation.

### One place Angular is better than the platform

Now the pleasant surprise, because it's not all bad news.

Remember the date-only parsing trap, where `new Date('2024-06-15')` gives you the fourteenth in any western zone? Angular special-cases it. The exact branch is [`toDate`, lines 924–946](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/i18n/format_date.ts#L924-L946), and the helper it calls explicitly [resets the result to local midnight](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/i18n/format_date.ts#L176-L200):

```js
if (/^(\d{4}(-\d{1,2}(-\d{1,2})?)?)$/.test(value)) {
  const [y, m = 1, d = 1] = value.split('-').map((val) => +val);
  return createDate(y, m - 1, d); // a LOCAL date
}
```

A date-only string gets built as a **local** calendar date, not UTC midnight. Verified with the host in Los Angeles:

```
formatDate('2024-06-15', 'yyyy-MM-dd HH:mm')  →  2024-06-15 00:00   ✓
new Date('2024-06-15')  local day             →  14                 ✗
```

Angular gets the intuitive answer and the platform doesn't. If you've been piping date-only strings from an API straight into `DatePipe` and wondering why you never hit the famous off-by-one bug, this is why. It's also a good reason not to "normalise" those strings into `Date` objects before they reach the template. You'd be reintroducing a bug Angular already handled.

### zone.js has nothing to do with timezones

Worth stating plainly because the naming is genuinely cruel.

`zone.js` is about **execution contexts**. It monkey-patches async APIs so Angular knows when to run change detection. It has no relationship to time, offsets, or the tz database.

This matters more now, because from Angular 21 onward new applications are **zoneless by default**. In v22.1.4, [`internalCreateApplication` includes `provideZonelessChangeDetectionInternal()` in every app injector](https://github.com/angular/angular/blob/v22.1.4/packages/core/src/application/create_application.ts#L64-L79). If you're on v21 or later and wondering what to configure to enable zoneless scheduling, the answer is nothing: the internal provider is already there.

You can still add `provideZonelessChangeDetection()` explicitly:

```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(), // optional in v22; states intent and enables dev diagnostics
    provideRouter(routes),
  ],
};
```

That call is not required to enable the scheduler, but it is not _only_ documentation either. The public provider [reuses the internal providers and adds development diagnostics](https://github.com/angular/angular/blob/v22.1.4/packages/core/src/change_detection/scheduling/zoneless_scheduling_impl.ts#L369-L395), including a warning when Zone.js is unexpectedly present. In a clean v22 CLI app without Zone.js, adding it does not change the scheduling mode; it states intent and keeps that diagnostic.

While we're on version-specific behaviour: Angular 22 made `OnPush` the default and named the eager strategy `Eager`. The enum source says [“OnPush is enabled by default” and defines `Eager`](https://github.com/angular/angular/blob/v22.1.4/packages/core/src/change_detection/constants.ts#L18-L42); the compiler contract also [documents `OnPush` as the default](https://github.com/angular/angular/blob/v22.1.4/packages/compiler/src/render3/partial/api.ts#L223-L227). The v22 migration is conservative: its registered description says it [adds `ChangeDetectionStrategy.Eager` to all components](https://github.com/angular/angular/blob/v22.1.4/packages/core/schematics/migrations.json#L1-L7), and the implementation [inserts that property only when it is missing](https://github.com/angular/angular/blob/v22.1.4/packages/core/schematics/migrations/change-detection-eager/migration.ts#L78-L123). That preserves old behaviour. In a signal-based app you may prefer the new default, but review those annotations rather than deleting them blindly.

### DatePipe is pure, and a clock is not

A subtler Angular problem, and one you'll hit the first time you build a live clock.

`DatePipe` is a **pure** pipe. This is not an inference from its behaviour: Angular's source documentation says it [runs only for a primitive change or a changed object reference, and that mutating a `Date` does not rerun it](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/pipes/date_pipe.ts#L61-L73). So this looks right and doesn't work:

```ts
// Broken: same Date object, mutated in place
private readonly now = new Date();
tick() {
  this.now.setTime(Date.now());   // reference never changes → no re-render
}
```

And under zoneless change detection, the timer callback itself is not a change-detection notification. Angular's source lists the notifications that schedule work — including [updating a signal read in a template](https://github.com/angular/angular/blob/v22.1.4/packages/core/src/change_detection/scheduling/zoneless_scheduling_impl.ts#L337-L355) — but a bare `setInterval` is not one of them.

The fix is the same as the fix for most things now — make the time a signal, and write to it:

```ts
readonly currentInstant = signal(new Date());

constructor() {
  effect((onCleanup) => {
    const interval = setInterval(() => this.currentInstant.set(new Date()), 1000);
    onCleanup(() => clearInterval(interval));
  });
}
```

New `Date` object each tick, so the reference changes; signal write, so change detection is scheduled. Both problems, one line.

### Configure the default once

If your whole app should render in one zone — an internal tool where everything is company time, say — set it globally instead of repeating it at every call site:

```ts
import { DATE_PIPE_DEFAULT_OPTIONS } from '@angular/common';

providers: [
  {
    provide: DATE_PIPE_DEFAULT_OPTIONS,
    useValue: { dateFormat: 'medium', timezone: '+0000' },
  },
];
```

The older `DATE_PIPE_DEFAULT_TIMEZONE` token is [deprecated in Angular's source](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/pipes/date_pipe.ts#L16-L24); use [`DATE_PIPE_DEFAULT_OPTIONS`](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/pipes/date_pipe.ts#L26-L59). And note the same limitation applies — that `timezone` value is a fixed offset, not a regional IANA zone, and it will not follow daylight saving.

### Locales need registering

`DatePipe` uses Angular's locale data. Angular's own source states that [only `en-US` locale data ships by default](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/pipes/date_pipe.ts#L67-L77); the locale lookup [falls back to English and otherwise throws `MISSING_LOCALE_DATA`](https://github.com/angular/angular/blob/v22.1.4/packages/core/src/i18n/locale_data_api.ts#L49-L71), surfaced as `NG0701`. Register every additional locale explicitly:

```ts
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';

registerLocaleData(localeEs, 'es');

providers: [{ provide: LOCALE_ID, useValue: 'es' }];
```

`Intl` needs no Angular locale registration because it uses the runtime's ICU data. That data costs no application-bundle bytes, but it is only as current and complete as the browser or Node release. Angular's pipe gives you controlled locale data; `Intl` gives you the runtime's locale and timezone support.

### Server-side rendering will find your bugs for you

This is the Angular-specific one that costs real money, and it follows directly from everything above.

With SSR and hydration, Angular first produces HTML on the server and then restores the application on the client. The server's timezone is whatever that process is configured to use — commonly UTC, but not guaranteed — while the browser normally uses the user's zone.

Any template that formats a date using the ambient zone can therefore produce different text on the server and client. That is a hydration-consistency problem, not a guaranteed “flicker”: [Angular documents that the server and client DOM must remain consistent](https://angular.dev/guide/hydration#constraints) and that mismatches can prevent hydration for the affected part of the page. The practical bug is the same: the initially delivered date can disagree with the value the browser would produce.

The defence is the rule from part one, applied ruthlessly: **be explicit about the zone at every formatting site.** If a date's rendering depends on `Intl.DateTimeFormat().resolvedOptions().timeZone`, it will differ between server and client, by design. Either pass an explicit zone, or accept that the value is client-only and render it after hydration rather than during.

If the correct zone is genuinely the user's, and you need it on the server, the browser has to tell you. There is no reliable timezone in standard request metadata: IP geolocation is only a guess and `Accept-Language` is not a zone. Capture the user's choice or send the browser-resolved zone explicitly when the server needs it.

### Date inputs hand you wall-clock strings

Last Angular thing, and it's where the gap and overlap from part five actually reach your users.

`<input type="datetime-local">` produces a string like `2024-11-03T01:30`. No offset. It is a _wall-clock reading_ — precisely the type that can name zero or two instants.

So if you take that value and do `new Date(value)`, you silently interpret it in the host's zone with the platform's built-in disambiguation. During a fall-back overlap, JavaScript chooses the earlier matching instant; during a spring-forward gap, it moves forward by the gap. Either way, the string records neither the zone nor that a choice was made.

Which means the conversion from a date input to a stored instant is a place that deserves real code, not a constructor call. Which brings us to what I'd actually build.

---

## Part eight: a field catalogue

Enough mechanics. Here are the concrete failures, in the shape you'll actually meet them.

I want to be straight about provenance, because it matters when you're deciding whether to trust a list like this.

Three of them I found in **this** codebase — an Angular app whose entire purpose is teaching people about timezones, which was shipping these bugs while doing so. Number 1 was a settings dropdown I built myself. Number 4 was an offset helper that had been quietly wrong for as long as it existed. Number 11 surfaced because a test failed and I nearly "fixed" the test.

The rest are patterns I reproduced on a real runtime while writing this, with the actual output pasted in. Nothing here is recalled from memory, and nothing is a hypothetical I couldn't make happen.

---

### 1. The timezone dropdown that never worked

**Symptom.** A settings page lets users pick a display timezone. Everyone reports that the times look right. They are all seeing their own local time.

**Why.** The dropdown is full of IANA names and they feed a `DatePipe`. `Date.parse('Jan 01, 1970 00:00:00 America/New_York')` is `NaN`, so Angular falls back to the host offset. Verified with the host set to Los Angeles:

```
formatDate(instant, 'yyyy-MM-dd HH:mm', 'en-US', 'America/New_York')  →  2024-07-15 05:00
formatDate(instant, 'yyyy-MM-dd HH:mm', 'en-US', 'Asia/Tokyo')        →  2024-07-15 05:00
formatDate(instant, 'yyyy-MM-dd HH:mm', 'en-US')                      →  2024-07-15 05:00
Intl, America/New_York                                                →  2024-07-15 08:00
```

Three identical rows. The argument does nothing.

**Fix.** Don't use `DatePipe` for a specific zone. Write a thin pipe over `Intl.DateTimeFormat`:

```ts
@Pipe({ name: 'zonedDate' })
export class ZonedDatePipe implements PipeTransform {
  transform(value: Date | number, timeZone: string, style: 'short' | 'medium' = 'medium') {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      dateStyle: style,
      timeStyle: 'short',
    }).format(value);
  }
}
```

**How to catch it.** Assert against `Intl` rather than against a snapshot. A snapshot test records whatever the pipe produced, including the wrong answer.

---

### 2. The offset that's right until March

**Symptom.** A report is correct all winter, then an hour out from spring.

**Why.** Somebody hit bug 1, discovered numeric offsets work, and hardcoded `'-0500'`. It's a frozen number:

```
formatDate(2024-01-15T12:00:00Z, 'HH:mm', 'en-US', '-0500')  →  07:00   ✓
formatDate(2024-07-15T12:00:00Z, 'HH:mm', 'en-US', '-0500')  →  07:00   ✗ (New York is 08:00)
```

**Fix.** Same as above. An offset literal cannot track a zone, and no amount of care makes it.

**How to catch it.** One test in January and one in July. That's the whole trick, and it would find a surprising number of production bugs.

---

### 3. The helpful normalisation that broke a date picker

**Symptom.** Dates from the API render a day early for users in the Americas. It worked before a refactor that "cleaned up types".

**Why.** The API returns `'2024-06-15'`. Someone converted it to a `Date` on the way in, for tidiness. `DatePipe` handles date-only _strings_ correctly — Angular's `toDate` regex-matches them and builds a **local** calendar date. The moment you pre-convert with `new Date()`, you get UTC midnight and the platform's off-by-one is back:

```
formatDate('2024-06-15', 'EEEE, d MMMM y')   →  Saturday, 15 June 2024   ✓
new Date('2024-06-15')  local day in LA      →  14                       ✗
```

**Fix.** Pass the string through untouched. If you must model it, model it as a calendar date — a `{ year, month, day }` object or `Temporal.PlainDate` — not an instant.

**How to catch it.** Run the suite in a zone behind UTC. This bug is invisible from Europe.

---

### 4. The offset helper that worked by accident

**Symptom.** None, for years. Then a locale change turned an offset calculation into `NaN`.

**Why.** This pattern, which is everywhere:

```js
const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
const tz = new Date(date.toLocaleString('en-US', { timeZone: zone }));
const offsetMinutes = (utc - tz) / 60000;
```

It parses a locale-formatted string with `new Date()`, which the spec doesn't require any engine to support. It survives because both sides carry the same parsing error and it cancels in the subtraction. Two things break it:

```js
new Date('7/15/2024, 12:00:00 PM').toISOString(); // '2024-07-15T10:00:00.000Z' — parsed as LOCAL
new Date('15/7/2024, 12:00:00'); // Invalid Date  — the es-ES format
```

It also leaks fractional minutes on historical dates. Seoul in 1850 gave me `507.8666666666667`.

**Fix.** Derive the offset from `formatToParts`. Take the zone's wall-clock parts, treat them as UTC, subtract the instant. Whole minutes, no parsing.

**How to catch it.** Assert `Number.isInteger()` on any offset your code computes. That one line would have caught it.

---

### 5. The `toISOString()` that saves the wrong day

This is the most common date bug in web development, and the direction it fires in is the part people get wrong.

**Symptom.** A user picks the fifteenth. The record saves as the fourteenth.

**Why.** Sending a date-only value by stringifying a `Date`:

```js
const chosen = new Date(2024, 5, 15); // local 15 June, midnight
chosen.toISOString().split('T')[0];
```

In Tokyo that yields `'2024-06-14'`. Local midnight on the fifteenth is 15:00 UTC on the _fourteenth_, and you threw the time away on the wrong side of the boundary.

```
TZ=Asia/Tokyo            →  '2024-06-14'   ✗
TZ=America/Los_Angeles   →  '2024-06-15'   ✓
```

Note that this is the **opposite hemisphere** from bug 3. That's why teams fix one and introduce the other, then conclude dates are cursed.

**Fix.** Never route a calendar date through UTC. Format from local parts:

```ts
const toCalendarDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
```

**How to catch it.** Test in a zone ahead of UTC _and_ one behind. Either alone passes.

---

### 6. The clock that stopped

**Symptom.** A live timestamp renders once and never updates. Worse in a zoneless app.

**Why.** Two independent causes stacking. `DatePipe` is a **pure** pipe — I checked, and unlike `async` and `keyvalue` it carries no `pure: false` flag — so it re-evaluates only when its input _reference_ changes. Mutating a `Date` in place changes no reference. And with zoneless change detection, a bare `setInterval` doesn't tell Angular anything happened.

**Fix.** A signal holding a fresh `Date` each tick solves both at once:

```ts
readonly now = signal(new Date());

constructor() {
  effect((onCleanup) => {
    const id = setInterval(() => this.now.set(new Date()), 1000);
    onCleanup(() => clearInterval(id));
  });
}
```

**How to catch it.** Assert the rendered text changes after advancing time. "It renders" is not the assertion you want.

---

### 7. The SSR flicker that shows the wrong day

**Symptom.** The page briefly shows one date, then swaps to another. Reported as a visual glitch. Sometimes it's a genuinely wrong date.

**Why.** Your component renders twice: on the server in the server's zone, almost always UTC, and in the browser in the user's zone. Any date formatted with the ambient zone differs between the two, and near midnight it differs by a _day_.

**Fix.** Be explicit about the zone at every formatting site. If a value's rendering depends on `Intl.DateTimeFormat().resolvedOptions().timeZone`, it will differ between server and client by design — either pass a zone, or defer it to after hydration.

**How to catch it.** Render with the server pinned to UTC and the client to `Pacific/Kiritimati` (`UTC+14:00`), then diff the two HTML outputs. A test that only inspects the hydrated DOM cannot see this.

---

### 8. The records that arrive out of order, once a year

**Symptom.** On one night in autumn, rows sort wrongly and a nightly aggregate double-counts.

**Why.** Local timestamps stored without an offset. During fall-back, `01:30` names two instants an hour apart:

```
2024-11-03T01:30:00-04:00  →  2024-11-03T05:30:00.000Z
2024-11-03T01:30:00-05:00  →  2024-11-03T06:30:00.000Z
```

Identical text in your column. The information isn't ambiguous, it's _gone_.

**Fix.** Store instants — epoch integers or ISO strings with offsets. If the user meant a wall-clock time, store that plus the IANA zone name, and resolve it when you need an instant.

**How to catch it.** This one you cannot test after the fact. It's a schema review, and it's why this is the item I'd act on first.

---

### 9. The scheduled job that skips a day

Our cold open. **Symptom:** a task set for 02:30 local doesn't run one night in spring, or runs twice one night in autumn.

**Why.** 02:30 doesn't exist on the spring-forward date, and happens twice on the fall-back date. Ask for it and nothing complains:

```js
// TZ=America/New_York
new Date('2024-03-10T02:30:00').toString();
// → 'Sun Mar 10 2024 03:30:00 GMT-0400'
```

**Fix.** Schedule in UTC for machine work. If it genuinely must be local wall-clock time, pick an hour outside every transition window — 04:00 is boring and safe — and make the job idempotent so a double run is harmless.

**How to catch it.** Put both transition dates in your fixtures.

---

### 10. The double negative

**Symptom.** A conversion is out by exactly twice the offset. Fourteen hours, in a zone seven hours out.

**Why.** `getTimezoneOffset()` returns the minutes to _add to local time to reach UTC_, which is the opposite sign to how offsets are written. So it reads as positive for zones behind UTC, and the intuitive arithmetic goes the wrong way:

```
TZ=America/Los_Angeles, instant 2024-07-15T12:00:00Z
getTimezoneOffset()          →  420
adding it                    →  2024-07-15T19:00:00.000Z   ✗
subtracting it               →  2024-07-15T05:00:00.000Z   ✓
```

**Fix.** Don't do offset arithmetic on instants. If you need a zone's offset, read it from `formatToParts` and give your helper a name that states the direction, so the sign is documented at the call site.

**How to catch it.** Test one zone ahead of UTC and one behind. A single-zone test passes with the sign inverted.

---

### 11. The zone name that doesn't equal itself

**Symptom.** A saved timezone preference never matches. A `switch` on the zone falls through to the default.

**Why.** Found this one by watching a test fail. Current ECMA-402 asks for primary identifiers, but older engines and ICU snapshots can return legacy aliases. On one tested runtime:

```
value a picker would store   →  'Asia/Calcutta'
literal in your code         →  'Asia/Kolkata'
=== comparison               →  false
canonical comparison         →  true
```

Both name the same place. Both work in `Intl`. They are not the same string, and in a log they look interchangeable.

**Fix.** Never compare zone identifiers with `===`. Normalise first:

```ts
const canonical = (zone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
```

**How to catch it.** Round-trip every value your picker can produce through your comparison logic. All four hundred of them — it takes milliseconds.

---

### The pattern behind all of them

Read the list again and nine of the eleven are the same mistake wearing different clothes: **a calendar date or a wall-clock reading got treated as an instant, or the reverse.**

Bug 3 and bug 5 are that error in opposite directions, which is why fixing one so often creates the other. Bug 8 is that error made permanent by a schema. Bugs 1 and 2 are Angular offering you an API that quietly encourages it.

Which is the argument for the next section, and for `Temporal` after it. If those are different types in your code, most of this list becomes unwriteable.

---

## Part nine: what to do instead

Everything above turns into one architectural rule, and it's the same rule `Temporal` is built on: **an instant and a wall-clock reading are different types, and you should never let one silently become the other.**

In practice I put the zone logic in one module, make every function take the zone as an argument, and never let the ambient zone into anything but the outermost layer. Rough shape:

```ts
/** A wall-clock reading. No zone, no instant, on its own. */
export interface WallClock {
  readonly year: number;
  readonly month: number;   // 1–12, because zero-indexing was a mistake
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/** Reads an instant as a wall-clock reading in an explicit zone. */
export function wallClockIn(instant: Date, timeZone: string): WallClock { … }

/** Signed minutes, POSITIVE when the zone is ahead of UTC. */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number { … }
```

Two implementation notes that cost me time, so you don't have to spend it.

First, derive the offset from the formatted parts rather than by regexing the `longOffset` string. Compute the wall-clock parts, treat them as if they were UTC, subtract. You get whole minutes and it stays consistent with your other reads. The popular alternative —

```js
// Don't. This is the non-ISO parsing trap wearing a disguise.
new Date(instant.toLocaleString('en-US', { timeZone }));
```

— relies on `new Date()` parsing a locale-formatted string, which the spec doesn't require. It yields _fractional_ minutes on historical dates (Seoul in 1850 gave me `507.8666…`), and swap the locale to `es-ES` and it returns `Invalid Date` outright. It only appears to work because the same error occurs on both sides of a subtraction and cancels out. I had this in my own code. It went.

Second, use `hourCycle: 'h23'` rather than `hour12: false` when reading hours, because the latter can report midnight as hour 24 on some ICU builds. And build UTC timestamps with `setUTCFullYear` rather than `Date.UTC`, because `Date.UTC` maps years 0–99 into the 1900s.

The interesting function is the reverse direction, and it's the one that can't be faked with a cached offset:

```ts
export type Disambiguation = 'compatible' | 'earlier' | 'later' | 'reject';

export function instantFromWallClock(
  wall: WallClock,
  timeZone: string,
  disambiguation: Disambiguation = 'compatible',
): Date {
  const targetMs = wallClockAsUtcMs(wall);

  // Probe a day either side so both sides of any transition are seen.
  const offsetBefore = zoneOffsetMinutes(new Date(targetMs - DAY_MS), timeZone);
  const offsetAfter  = zoneOffsetMinutes(new Date(targetMs + DAY_MS), timeZone);

  // Keep only candidates that render back to the requested reading.
  const candidates = [...new Set([offsetBefore, offsetAfter])]
    .map((offset) => new Date(targetMs - offset * MINUTE_MS))
    .filter((c) => sameWallClock(wallClockIn(c, timeZone), wall))
    .sort((a, b) => a.getTime() - b.getTime());

  if (candidates.length === 1) return candidates[0];

  if (candidates.length === 0) {
    // Skipped hour — this reading never existed.
    if (disambiguation === 'reject') throw new RangeError(…);
    return new Date(targetMs - offsetBefore * MINUTE_MS);
  }

  // Repeated hour — two real instants share this reading.
  if (disambiguation === 'reject') throw new RangeError(…);
  return disambiguation === 'later' ? candidates.at(-1)! : candidates[0];
}
```

The candidate count _is_ the answer. One is unambiguous. Zero means the clocks moved forward and you named an hour that doesn't exist. Two means they moved back and you named an hour that happened twice.

That's the bit worth stealing even if you take nothing else. Most conversion code returns an instant and never tells you the question was unanswerable. Surfacing the count lets you put an actual message in front of a user — "that time doesn't exist on this date" — instead of picking one and hoping.

---

## Part ten: testing, which is the whole point

A date test that passes on your laptop and not in CI has told you nothing. Pin the zone before the process starts:

```json
{
  "scripts": {
    "test": "TZ=UTC vitest --run"
  }
}
```

Before the process starts matters. Assigning `process.env.TZ` at runtime works in some Node versions and not others, and anything that already read the zone keeps the old value. Support on Windows was broken for years. Don't rely on it.

Better: don't merely pin the zone, **assert** it, so the suite fails loudly rather than drifting:

```ts
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (!['UTC', 'Etc/UTC', 'GMT'].includes(zone)) {
  throw new Error(`Tests must run with TZ=UTC, but the zone is "${zone}". Use: pnpm test`);
}
```

Then, if your zone logic is genuinely zone-independent, prove it by running the same suite from several host zones:

```json
"test:zones": "for tz in UTC America/New_York Asia/Kathmandu Pacific/Kiritimati Australia/Lord_Howe; do TZ=$tz vitest --run || exit 1; done"
```

Fifty tests times five zones is two hundred and fifty executions, and if they all pass you have _demonstrated_ that no ambient zone leaked into your logic rather than asserted it in a comment. That's the difference between a claim and a proof, and it took about four lines of shell.

And point it at dates where the rules do something. These six earn their place:

| Date       | Zone                | Why                                            |
| ---------- | ------------------- | ---------------------------------------------- |
| 2024-03-10 | America/New_York    | Spring forward — 02:00–02:59 doesn't exist     |
| 2024-11-03 | America/New_York    | Fall back — 01:00–01:59 happens twice          |
| 2024-04-07 | Australia/Lord_Howe | A 30-minute shift, not 60                      |
| 2024-01-15 | Australia/Sydney    | Southern hemisphere — on DST in January        |
| 2024-06-15 | Asia/Kathmandu      | A `:45` offset, to catch hour-only assumptions |
| 2011-12-30 | Pacific/Apia        | A calendar day that never existed              |

That last one is my favourite. Samoa jumped the international date line in December 2011 to trade more easily with Australia and New Zealand, and Friday the thirtieth simply did not occur there. If your code walks a date range day by day, it will either skip or repeat, and this is the fixture that tells you which.

For the record, when you need to change your own zone, Chrome DevTools is the fastest path. Open the Command Menu, run **Show Sensors**, select a Location, and reload. For a reusable Cairo preset, open DevTools Settings → Locations and add `30.0444`, `31.2357`, `Africa/Cairo`, and `ar-EG`. Select it in Sensors and verify with `Intl.DateTimeFormat().resolvedOptions()`.

That custom preset deliberately changes both timezone and locale. If the bug is about zone rules, keep `es-ES` and change only the timezone to `Africa/Cairo`; if the bug is about the complete Egyptian experience, use `ar-EG`. Testing one variable at a time makes the failure much easier to diagnose.

Prefixing a **Node or test command** with `TZ=Asia/Tokyo` controls that process; prefixing the Angular dev server does not change a separate browser tab. Playwright takes `timezoneId` per browser context, which makes cross-zone assertions genuinely easy.

One correction on a piece of folklore, since I'd repeated it myself: you'll read that a slim Docker image without the `tzdata` package makes every zone silently resolve to UTC. That's not right, and it's worth being precise. Node bundles full ICU, which carries its own copy of the tz database, so `Intl.DateTimeFormat` with an explicit `timeZone` works fine in a bare Alpine container. And an unrecognised zone name doesn't fall back to anything — it throws:

```js
new Intl.DateTimeFormat('en', { timeZone: 'Not/AZone' });
// RangeError: Invalid time zone specified: Not/AZone
```

What a missing `tzdata` actually breaks is narrower: resolving the **process default** zone from the `TZ` variable, which reads the platform's zoneinfo files. Install `tzdata` if you depend on `TZ`. Better, don't depend on it — pass explicit zones in code and the base image stops being part of your correctness story.

---

## Part eleven: libraries, and where this is going

Quick opinions, since everyone asks.

The distinction that actually matters between date libraries isn't the API, it's **where the timezone rules come from**.

Luxon, Day.js with its timezone plugin, `@date-fns/tz`, `@internationalized/date` and Temporal read the _engine's_ timezone data. They ship no separate tzdb, so their rules are as current as the browser or runtime release — which can still be stale on an old device.

Moment Timezone and `@js-joda/timezone` bundle their own copy. Moment Timezone is about 114 kB gzipped, and its data is frozen at the version you installed. Every government rule change needs a dependency bump and a redeploy.

That's a large difference, and most comparison tables lead with syntax instead.

So, briefly: if you only need to _display_ dates, use `Intl` and install nothing. If you need arithmetic in the local zone, `date-fns` tree-shakes down to a couple of kilobytes. If you need real multi-zone logic in production today, Luxon, at 21 kB. Moment is in maintenance mode by its own maintainers' description, and if you're on it, Day.js is a near drop-in for a fast size win.

And then there's `Temporal`, which is the actual answer.

It's the [ES2026 replacement for `Date`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal), and it isn't a nicer wrapper — it's a different design that deletes essentially every trap in this article structurally rather than by convention. `PlainDate` has no time and no zone, so the date-only bug cannot be expressed. Months are 1–12. Everything is immutable. `ZonedDateTime` carries its IANA identifier as part of its value.

Best of all, the two kinds of "add a day" stop being a trap and become an argument:

```js
const start = Temporal.ZonedDateTime.from('2024-03-09T12:00:00[America/New_York]');

start.add({ days: 1 }); // 2024-03-10T12:00:00-04:00  — calendar day, 12:00 kept
start.add({ hours: 24 }); // 2024-03-10T13:00:00-04:00  — exact elapsed time
```

Same DST boundary that bit us in part four. Now you say which one you meant.

And the gap and overlap become explicit rather than silent:

```js
Temporal.ZonedDateTime.from(
  { year: 2024, month: 3, day: 10, hour: 2, minute: 30, timeZone: 'America/New_York' },
  { disambiguation: 'reject' },
);
// RangeError — that time does not exist
```

TC39's implementation status lists Firefox 139, Chrome 144, and Node 26 as shipped. Safari stable is not listed yet, so it is not safe to assume. Feature-detect in the runtime you actually support and use a tested polyfill where needed.

The type split is the whole idea, and it's worth adopting even before you can use the API. `Instant` is a moment. `PlainDate` is a calendar date with no instant. `PlainTime` is a wall-clock reading. `ZonedDateTime` is an instant plus the zone it should be read in. Every bug in this article came from `Date` pretending all four were the same thing.

Keep those four separate in your own domain model today, however you spell them, and the eventual migration is mechanical.

---

## The part I'd keep

If you skimmed, here's what I'd actually want you to walk away with.

An instant and a wall-clock reading are different types. Storing the second one without a zone destroys information you can't get back. Offsets are readings, not properties, so never cache one for another date. And when you're formatting in Angular, `DatePipe`'s timezone argument doesn't take timezones — reach for `Intl` and move on.

Then go add the tenth of March and the third of November to your fixtures.

The thing about timezone bugs is that they're not really about time. They're about a value that means one thing where it was created and something else where it's read, and code that never gets a chance to notice. The clock is just where we happen to keep tripping over it.

Somewhere right now it's 01:30 for the second time today, and something is writing that to a database.

---

## References

The two pieces this article leans on most. If you read nothing else here, read these:

- **[Everything You Need to Know About Date in JavaScript](https://css-tricks.com/everything-you-need-to-know-about-date-in-javascript/)** — Zell Liew, CSS-Tricks. The best single tour of the `Date` API's rough edges: the four ways to construct one, why the date-string form is a trap, zero-indexed months, comparison, mutation, and automatic rollover. Part four here is a compressed version of ground he covers properly.
- **[Handling Time Zone in JavaScript](https://toastui.medium.com/handling-time-zone-in-javascript-547e67aa842d)** — DongWoo Kim, TOAST UI. Written while adding timezone support to a production calendar library, which is why it's honest about failing. The one-zone-to-many-offsets framing, the historical-database argument, and the cached-offset conversion bug all come from here. Its conclusion — use a library, but understand what it does for you first — is the right one.

### Specifications and reference

- [`Date` — MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)
- [`Date.parse()` — MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse) — the warning about non-standard string formats
- [`Intl.DateTimeFormat` — MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- [`Intl.supportedValuesOf()` — MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/supportedValuesOf)
- [`Temporal` — MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal)
- [ECMA-262](https://tc39.es/ecma262/) — including the daylight saving section, which defines the adjustment as implementation-dependent and merely _recommends_ IANA
- [IANA Time Zone Database](https://www.iana.org/time-zones) — the maintained civil-time database
- [IANA tzdb theory](https://data.iana.org/time-zones/theory.html) — naming, historical scope, links, and limitations
- [NIST: Coordinated Universal Time (UTC)](https://www.nist.gov/pml/time-and-frequency-division/how-utcnist-related-coordinated-universal-time-utc-international) — UTC as the international reference time scale and local time as an offset from it
- [NIST: A Walk Through Time](https://www.nist.gov/pml/time-and-frequency-division/popular-links/walk-through-time) — standard time and the 1884 prime-meridian decision
- [`Temporal` support — caniuse](https://caniuse.com/temporal)

### Angular

- [`DatePipe` — angular.dev](https://angular.dev/api/common/DatePipe)
- [`formatDate()` — angular.dev](https://angular.dev/api/common/formatDate)
- [`DATE_PIPE_DEFAULT_OPTIONS` — angular.dev](https://angular.dev/api/common/DATE_PIPE_DEFAULT_OPTIONS) — application-wide date format and fixed-offset configuration
- [Angular without ZoneJS (Zoneless)](https://angular.dev/guide/zoneless)
- [`registerLocaleData()` — angular.dev](https://angular.dev/api/common/registerLocaleData)
- [Angular 22.1.4 source: `DatePipe.transform`](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/pipes/date_pipe.ts#L231-L278) — documents an offset and forwards it to `formatDate`
- [Angular 22.1.4 source: host-offset fallback](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/i18n/format_date.ts#L119-L123) — starts with `date.getTimezoneOffset()`
- [Angular 22.1.4 source: `timezoneToOffset`](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/i18n/format_date.ts#L891-L897) — parses the supplied value and returns the fallback for `NaN`
- [Angular 22.1.4 source: fixed-offset conversion](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/i18n/format_date.ts#L899-L910) — applies the parsed offset arithmetically
- [Angular 22.1.4 source: date-only parsing](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/i18n/format_date.ts#L924-L946) and [local-midnight construction](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/i18n/format_date.ts#L176-L200) — the exact `toDate` special case quoted above
- [Angular 22.1.4 source: DatePipe defaults and deprecation](https://github.com/angular/angular/blob/v22.1.4/packages/common/src/pipes/date_pipe.ts#L16-L59) — the old token, the replacement, and their fixed-offset examples
- [Angular 22.1.4 source: zoneless application bootstrap](https://github.com/angular/angular/blob/v22.1.4/packages/core/src/application/create_application.ts#L64-L79), [scheduler notifications](https://github.com/angular/angular/blob/v22.1.4/packages/core/src/change_detection/scheduling/zoneless_scheduling_impl.ts#L337-L355), and [public zoneless provider](https://github.com/angular/angular/blob/v22.1.4/packages/core/src/change_detection/scheduling/zoneless_scheduling_impl.ts#L369-L395)
- [Angular 22.1.4 source: change-detection strategies](https://github.com/angular/angular/blob/v22.1.4/packages/core/src/change_detection/constants.ts#L18-L42) and [v22 eager migration](https://github.com/angular/angular/blob/v22.1.4/packages/core/schematics/migrations/change-detection-eager/migration.ts#L78-L123)
- [Angular 22.1.4 source: missing-locale error](https://github.com/angular/angular/blob/v22.1.4/packages/core/src/i18n/locale_data_api.ts#L49-L71)

### Tooling

- [Sensors: emulate device sensors — Chrome for Developers](https://developer.chrome.com/docs/devtools/sensors) — the fastest way to change your zone
- [DevTools custom locations](https://developer.chrome.com/docs/devtools/settings/locations) — reusable presets with coordinates, timezone ID, and locale
- [What's new in DevTools, Chrome 83](https://developer.chrome.com/blog/new-in-devtools-83) — the note explaining that a Location override changes the locale too, not just the zone
- [Playwright `timezoneId`](https://playwright.dev/docs/api/class-browser#browser-new-context-option-timezone-id)
- [Node.js `TZ` documentation](https://nodejs.org/api/cli.html#tz)
- [`datetime-local` — MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/datetime-local) — local wall-clock values contain no zone or offset
- [Shiki documentation](https://shiki.style/guide/install) — syntax highlighting used in the companion app

### Libraries mentioned

- [Luxon](https://moment.github.io/luxon/) · [date-fns](https://date-fns.org/) · [`@date-fns/tz`](https://github.com/date-fns/tz) · [Day.js](https://day.js.org/) · [`@internationalized/date`](https://react-spectrum.adobe.com/internationalized/date/) · [js-joda](https://js-joda.github.io/js-joda/) · [temporal-polyfill](https://github.com/fullcalendar/temporal-polyfill)
- [Moment project status](https://momentjs.com/docs/#/-project-status/) — worth reading in the maintainers' own words before starting anything new with it

---

_The claims and linked sources in this article were rechecked on 16 September 2026 against Angular 22.1.4 and current specifications; runtime demonstrations were also executed rather than recalled — including the `DatePipe` findings, which are the reason I had to correct something I'd previously written. Bundle sizes and download counts are a snapshot and will drift. If you reproduce any of it on a different engine or a newer Angular and get something else, I'd genuinely like to know._

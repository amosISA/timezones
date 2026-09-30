/**
 * Global test setup.
 *
 * The suite must run under a known timezone, otherwise any assertion touching
 * the host zone becomes a coin flip that depends on whose laptop ran it. Rather
 * than silently tolerating that, this fails loudly with an actionable message.
 *
 * The zone is pinned by the `TZ` variable *before the process starts* (see the
 * `test` script in package.json). Assigning `process.env.TZ` from inside a
 * running process is not reliable — some engines cache the zone on first use —
 * which is why this file asserts rather than sets.
 *
 * `pnpm test:zones` deliberately runs the same suite from several host zones to
 * prove the core module is zone-independent, and sets `ALLOW_ANY_TZ` to opt out
 * of the assertion.
 */

const environment = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env;

const allowAnyZone = environment?.['ALLOW_ANY_TZ'] === '1';
const actualZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

// UTC has several spellings across ICU builds; all describe the same zone.
const isUtc = ['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT'].includes(actualZone);

if (!allowAnyZone && !isUtc) {
  throw new Error(
    [
      '',
      `Tests must run with TZ=UTC, but the runtime zone is "${actualZone}".`,
      '',
      'Run the suite through the npm script, which pins it:',
      '    pnpm test',
      '',
      'To deliberately exercise other host zones:',
      '    pnpm test:zones',
      '',
    ].join('\n'),
  );
}

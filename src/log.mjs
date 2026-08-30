/**
 * Output is a build log someone reads while waiting, not a UI. Colour only
 * where it separates a heading from its detail; nothing that breaks when the
 * stream is piped to a file (which is how CI and `> build.log` see it).
 */

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const dim = wrap(2);
export const bold = wrap(1);
export const cyan = wrap(36);
export const green = wrap(32);
export const yellow = wrap(33);
export const red = wrap(31);

export const step = (msg) => console.log(`${cyan("→")} ${msg}`);
export const ok = (msg) => console.log(`${green("✓")} ${msg}`);
export const warn = (msg) => console.log(`${yellow("!")} ${msg}`);
export const info = (msg) => console.log(`  ${dim(msg)}`);
export const head = (msg) => console.log(`\n${bold(msg)}`);

export const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
export const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

/** Duration as m:ss — the same format the player's transport uses. */
export const clock = (s) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

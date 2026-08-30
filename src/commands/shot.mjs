/**
 * Screenshot the built lesson, one PNG per beat.
 *
 * This is the verification loop. A lesson is 13 minutes long; watching it to
 * find that beat 14 draws off-stage is not a workflow. The player exposes
 * `?beat=N&p=0.6` — freeze that far into a beat with no audio — precisely so
 * every state can be captured directly instead of played through.
 *
 * Headless Chrome rather than a browser-automation extension: an extension
 * needs site permissions and cannot reach localhost, which makes local pages
 * the one thing it cannot look at.
 */

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadConfig } from "../config.mjs";
import { findChrome, isWslWithWindowsChrome, run as exec, OS } from "../platform.mjs";
import { serveDir } from "./serve.mjs";
import { head, info, ok, warn } from "../log.mjs";

/**
 * A Windows Chrome driven from WSL cannot resolve `localhost` back into the
 * distro, and cannot write a screenshot to a Linux path. Both are solved by
 * using the distro's LAN address and translating the output path — but the
 * translation only exists inside WSL, hence the narrow guard.
 */
const wslAddress = async () => {
  const { out } = await exec("hostname", ["-I"]);
  return out.trim().split(/\s+/)[0];
};
const toWindowsPath = async (p) => (await exec("wslpath", ["-w", p])).out.trim();


export const run = async (argv) => {
  const cfg = await loadConfig();
  const dir = argv.dir ? resolve(process.cwd(), argv.dir) : join(cfg.out, cfg.slug);
  const outDir = resolve(process.cwd(), argv.out ?? join(cfg.root, "stills"));
  const port = Number(argv.port ?? 8917);
  const at = argv.at === undefined ? 0.6 : Number(argv.at);
  const size = (argv.size ?? "1600,900").split(",").map(Number);

  const chrome = await findChrome();
  if (!chrome) {
    throw new Error(
      `no Chrome found. Set PLAY_CHROME to its path.\n` +
      (OS === "darwin"
        ? `  macOS default: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
        : `  Linux default: /usr/bin/google-chrome`),
    );
  }

  const crossBoundary = isWslWithWindowsChrome(chrome);
  const host = crossBoundary ? await wslAddress() : "127.0.0.1";

  await mkdir(outDir, { recursive: true });
  const server = await serveDir(dir, port, crossBoundary ? "0.0.0.0" : "127.0.0.1");

  head(`shot · ${cfg.slug} · ${cfg.beats.length} beats @ p=${at}`);
  if (crossBoundary) {
    info(`Windows Chrome driven from WSL — serving on ${host}:${port} instead of localhost`);
  }

  const which = argv.only
    ? cfg.beats.map((b, i) => ({ b, i })).filter(({ b }) => argv.only.includes(b.id))
    : cfg.beats.map((b, i) => ({ b, i }));

  try {
    for (const { b, i } of which) {
      const png = join(outDir, `${String(i).padStart(2, "0")}-${b.id}.png`);
      const target = crossBoundary ? await toWindowsPath(png) : png;
      const url = `http://${host}:${port}/?beat=${i}&p=${at}${argv.open && b.interactive ? "&open=1" : ""}`;

      await exec(chrome, [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--hide-scrollbars",
        // Fonts come from Google Fonts and the scene may animate on a timer;
        // virtual time lets the page settle without a real-time wait per beat.
        `--virtual-time-budget=${argv.settle ?? 3500}`,
        `--window-size=${size[0]},${size[1]}`,
        `--screenshot=${target}`,
        url,
      ]);
      info(`${String(i).padStart(2, "0")}  ${b.id}`);
    }
  } finally {
    server.close();
  }

  ok(`${which.length} still(s) → ${outDir}`);
  if (argv.open) info(`--open captured interactives in their opened state`);
  else warn(`interactives were NOT opened — add --open to capture those too`);
  return { outDir, count: which.length };
};

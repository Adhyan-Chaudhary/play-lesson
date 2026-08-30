/**
 * Scaffold a lesson folder anywhere on disk.
 *
 * The folder holds only what a human writes: the config, the transcript, the
 * two content files. No node_modules, no build config, no copy of the player —
 * those come from the installed package, which is what makes a lesson portable
 * and what stops fifteen lessons drifting into fifteen slightly different shells.
 */

import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { head, info, ok } from "../log.mjs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATE = join(PKG, "templates", "lesson");

const titleFromSlug = (slug) =>
  slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

export const run = async (argv) => {
  const slug = argv._[0];
  if (!slug) throw new Error(`usage: play-lesson init <slug> [--title "..."] [--dir <path>]`);
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`slug must be lowercase letters, digits and hyphens — got "${slug}"`);
  }

  const dir = resolve(process.cwd(), argv.dir ?? slug);
  const title = argv.title ?? `${titleFromSlug(slug)} — interactive`;

  const existing = await readdir(dir).catch(() => null);
  if (existing?.length) throw new Error(`${dir} already exists and is not empty`);

  await mkdir(dir, { recursive: true });
  await cp(TEMPLATE, dir, { recursive: true });

  const cfgPath = join(dir, "lesson.config.json");
  const cfg = (await readFile(cfgPath, "utf8"))
    .replace("__SLUG__", slug)
    .replace("__TITLE__", title.replace(/"/g, '\\"'));
  await writeFile(cfgPath, cfg, "utf8");

  head(`init · ${slug}`);
  ok(dir);
  info(`lesson.config.json   chapters, beats, which beats open an interactive`);
  info(`transcript.txt       narration, one "## <beat-id>" per beat`);
  info(`scenes.tsx           the film layer — one artefact, every beat a state of it`);
  info(`interactives.tsx     the popups — success derived from state, never a timer`);
  console.log("");
  info(`next:  cd ${argv.dir ?? slug}`);
  info(`       play-lesson voice     # free draft narration + captions`);
  info(`       play-lesson make      # timings, manifest, bundle`);
  info(`       play-lesson serve     # look at it`);
  return { dir };
};

/**
 * Measure every beat's audio and write timings.json.
 *
 * Durations are measured, never declared. The player's whole clock is
 * `beat.start + audio.currentTime`, so a typed duration that disagreed with
 * the file by 200ms would desync captions from the voice in a way that is
 * felt but hard to name.
 */

import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig, paths } from "../config.mjs";
import { duration } from "../platform.mjs";
import { head, info, ok, warn, clock } from "../log.mjs";

export const run = async () => {
  const cfg = await loadConfig();
  const p = paths(cfg);

  let files;
  try {
    files = new Set((await readdir(p.audio)).filter((f) => f.endsWith(".mp3")));
  } catch {
    throw new Error(`no audio/ directory in ${cfg.root} — run \`play-lesson voice\` first`);
  }

  head(`timings · ${cfg.slug}`);

  const timings = {};
  const missing = [];

  for (const beat of cfg.beats) {
    const f = `${beat.id}.mp3`;
    if (!files.has(f)) {
      missing.push(beat.id);
      continue;
    }
    timings[beat.id] = await duration(join(p.audio, f));
  }

  if (missing.length) {
    throw new Error(
      `no audio for ${missing.length} beat(s): ${missing.join(", ")}\n` +
      `  Every beat in ${"lesson.config.json"} needs audio/<id>.mp3.\n` +
      `  Run \`play-lesson voice\`, or remove the beat from the config.`,
    );
  }

  // Audio present that no beat claims is usually a renamed beat — the old clip
  // is then dead weight in the build and a sign the config drifted.
  const orphans = [...files].filter((f) => !timings[f.replace(/\.mp3$/, "")]);
  if (orphans.length) warn(`audio/ has ${orphans.length} clip(s) no beat uses: ${orphans.join(", ")}`);

  await writeFile(p.timings, JSON.stringify(timings, null, 2) + "\n", "utf8");

  const total = Object.values(timings).reduce((a, b) => a + b, 0);
  ok(`timings.json · ${cfg.beats.length} beats · ${clock(total)} of narration`);
  info(`shortest ${clock(Math.min(...Object.values(timings)))} · longest ${clock(Math.max(...Object.values(timings)))}`);
  return { timings, total };
};

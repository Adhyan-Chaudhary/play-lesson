/**
 * What is and is not available on this machine, and what each thing unblocks.
 *
 * Worth its own command because the package is meant to run on macOS, Linux
 * and WSL, and every one of them is missing something different. A named
 * missing tool with the install line beside it is the difference between a
 * five-second fix and a debugging session.
 */

import { access } from "node:fs/promises";
import { join } from "node:path";
import { findLessonRoot, loadConfig, paths } from "../config.mjs";
import { findChrome, has, isWslWithWindowsChrome, OS } from "../platform.mjs";
import { bold, dim, green, head, info, red, yellow } from "../log.mjs";

const row = (okFlag, label, detail) =>
  console.log(`  ${okFlag ? green("✓") : yellow("✗")} ${label.padEnd(16)} ${dim(detail)}`);

export const run = async () => {
  head(`doctor`);
  console.log(`  ${bold("platform")}         ${OS}  ·  node ${process.version}`);
  console.log("");

  const ffprobe = await has("ffprobe", ["-version"]);
  row(ffprobe, "ffprobe", ffprobe ? "clip durations" : "REQUIRED — install ffmpeg");

  const edge = await has("edge-tts", ["--version"]);
  row(edge, "edge-tts", edge ? "free draft narration" : "optional — pipx install edge-tts");

  const key = !!process.env.ELEVENLABS_API_KEY;
  row(key, "ELEVENLABS_API_KEY", key ? "final narration + measured caption times" : "optional — only needed for the paid provider");

  const chrome = await findChrome();
  row(!!chrome, "chrome", chrome ? `${chrome}${isWslWithWindowsChrome(chrome) ? "  (Windows binary via WSL)" : ""}` : "optional — needed by `shot`; set PLAY_CHROME");

  const root = await findLessonRoot();
  console.log("");
  if (!root) {
    info(`no lesson here — run \`play-lesson init <slug>\` or cd into a lesson folder`);
    return;
  }

  const cfg = await loadConfig();
  const p = paths(cfg);
  console.log(`  ${bold("lesson")}           ${cfg.slug}  ·  ${cfg.beats.length} beats  ·  ${cfg.chapters.length} chapters`);
  console.log("");

  const seen = async (label, path, detail) => {
    const there = await access(path).then(() => true).catch(() => false);
    row(there, label, there ? detail : `missing — ${detail}`);
    return there;
  };

  await seen("transcript.txt", p.transcript, "narration source");
  await seen("audio/", p.audio, "run `play-lesson voice`");
  await seen("captions/", p.captions, "written alongside the audio");
  await seen("timings.json", p.timings, "run `play-lesson timings`");
  await seen("manifest", p.manifest, "run `play-lesson manifest`");
  await seen("scenes.tsx", p.scenes, "the film layer");
  await seen("interactives.tsx", p.interactives, "the popups");
  await seen("built", join(cfg.out, cfg.slug, "index.html"), "run `play-lesson build`");

  if (!ffprobe) {
    console.log("");
    console.log(`  ${red("ffprobe is required")} — every other step depends on measured durations.`);
  }
};

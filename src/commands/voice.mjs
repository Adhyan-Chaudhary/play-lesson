/**
 * transcript.txt → audio/<beat>.mp3 + captions/<beat>.json, one clip per beat.
 *
 * Per-beat clips rather than one long file, because the player's clock is
 * `beat.start + audio.currentTime`: separate clips make seeking to a beat a
 * src change instead of an offset calculation, and let a single beat be
 * re-recorded after an edit without re-spending the whole lesson.
 *
 * A PAID provider never runs without --yes. The cost is printed first, in the
 * unit the vendor bills in, so the decision is made on a number rather than a
 * vibe.
 */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig, paths, parseTranscript } from "../config.mjs";
import { getProvider } from "../providers/index.mjs";
import { head, info, ok, step, warn, yellow, bold } from "../log.mjs";

export const run = async (argv) => {
  const cfg = await loadConfig();
  const p = paths(cfg);
  const providerId = argv.provider ?? cfg.voice.provider;
  const provider = getProvider(providerId);

  let raw;
  try {
    raw = await readFile(p.transcript, "utf8");
  } catch {
    throw new Error(`no transcript.txt in ${cfg.root}`);
  }

  const sections = parseTranscript(raw);
  const byId = new Map(sections.map((s) => [s.id, s.text]));

  // Only beats the config declares, in config order. A stray heading in the
  // transcript is a warning, not a build: the config decides what a lesson is.
  const wanted = argv.only ? cfg.beats.filter((b) => argv.only.includes(b.id)) : cfg.beats;
  const missing = wanted.filter((b) => !byId.has(b.id));
  if (missing.length) {
    throw new Error(
      `transcript.txt has no "## ${missing[0].id}" section` +
      (missing.length > 1 ? ` (and ${missing.length - 1} more)` : "") +
      `\n  Every beat in lesson.config.json needs a matching heading.`,
    );
  }
  const extra = sections.filter((s) => !cfg.beats.some((b) => b.id === s.id));
  if (extra.length) warn(`transcript has ${extra.length} heading(s) no beat uses: ${extra.map((s) => s.id).join(", ")}`);

  const problem = await provider.check();
  if (problem) throw new Error(problem);

  head(`voice · ${cfg.slug} · ${providerId} · ${cfg.voice.name}`);

  // Skip clips that already exist unless asked to redo them — re-running after
  // fixing one beat should not re-spend the other nineteen.
  const todo = [];
  for (const b of wanted) {
    const exists = await stat(join(p.audio, `${b.id}.mp3`)).then(() => true).catch(() => false);
    if (exists && !argv.force) continue;
    todo.push(b);
  }

  if (!todo.length) {
    ok(`all ${wanted.length} clips already recorded — pass --force to redo them`);
    return { synthed: 0 };
  }

  const chars = todo.reduce((n, b) => n + byId.get(b.id).length, 0);

  if (provider.needsConsent && !argv.yes) {
    console.log("");
    console.log(yellow(`  ${bold(providerId)} is a paid provider and this run is not confirmed.`));
    console.log(`  ${todo.length} clip(s), ${chars.toLocaleString()} characters of billed synthesis.`);
    console.log(`  Re-run with --yes to spend it, or drop --provider to draft free on edge-tts.`);
    console.log("");
    throw new Error("refused: paid synthesis needs --yes");
  }

  await mkdir(p.audio, { recursive: true });
  await mkdir(p.captions, { recursive: true });

  let estimated = false;
  for (const [n, b] of todo.entries()) {
    const text = byId.get(b.id);
    step(`${String(n + 1).padStart(2, " ")}/${todo.length}  ${b.id}  ${text.length} chars`);
    const res = await provider.synth({
      text,
      mp3Path: join(p.audio, `${b.id}.mp3`),
      voice: cfg.voice.name,
      rate: cfg.voice.rate,
      modelId: cfg.voice.modelId,
    });
    estimated = estimated || res.estimated;
    await writeFile(
      join(p.captions, `${b.id}.json`),
      JSON.stringify({ words: res.words }) + "\n",
      "utf8",
    );
  }

  ok(`${todo.length} clip(s) · audio/ + captions/`);
  if (estimated) {
    info("caption word times are ESTIMATED from sentence cues — fine for a caption band,");
    info("not for word-level highlighting. Re-run with --provider elevenlabs for measured times.");
  }
  info("next: play-lesson make");
  return { synthed: todo.length };
};

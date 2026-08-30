/**
 * lesson.config.json is the one file that describes a lesson. It holds only
 * what a human decides — chapter names, beat order, which beats open an
 * interactive. Everything measurable (clip durations, cumulative starts, total
 * runtime) is derived, never typed, so the config cannot drift from the audio.
 *
 * Beat order is the narration order, and `start` is a running sum with no gaps
 * — the beats are butt-jointed so the lesson plays as one continuous track.
 */

import { readFile, access } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const CONFIG_NAME = "lesson.config.json";

/** Walk up from `from` looking for a lesson root, like git finding .git. */
export const findLessonRoot = async (from = process.cwd()) => {
  let dir = resolve(from);
  for (;;) {
    try {
      await access(join(dir, CONFIG_NAME));
      return dir;
    } catch {
      const up = dirname(dir);
      if (up === dir) return null;
      dir = up;
    }
  }
};

const req = (cond, msg) => {
  if (!cond) throw new Error(`${CONFIG_NAME}: ${msg}`);
};

export const loadConfig = async (from) => {
  const root = await findLessonRoot(from);
  if (!root) {
    throw new Error(
      `no ${CONFIG_NAME} here or in any parent directory.\n` +
      `  Run \`play-lesson init <slug>\` to start a lesson, or cd into one.`,
    );
  }

  let cfg;
  const file = join(root, CONFIG_NAME);
  try {
    cfg = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    throw new Error(`${file} is not valid JSON — ${e.message}`);
  }

  req(typeof cfg.slug === "string" && /^[a-z0-9-]+$/.test(cfg.slug),
    "`slug` must be a lowercase-hyphen string (it becomes the output folder name)");
  req(typeof cfg.title === "string" && cfg.title.length, "`title` is required");
  req(Array.isArray(cfg.chapters) && cfg.chapters.length, "`chapters` must be a non-empty array");
  req(Array.isArray(cfg.beats) && cfg.beats.length, "`beats` must be a non-empty array");

  const ids = new Set();
  cfg.beats.forEach((b, i) => {
    req(typeof b.id === "string" && b.id.length, `beats[${i}].id is required`);
    req(!ids.has(b.id), `duplicate beat id "${b.id}" — ids name the audio files, so they must be unique`);
    ids.add(b.id);
    req(Number.isInteger(b.chapter) && b.chapter >= 0 && b.chapter < cfg.chapters.length,
      `beats[${i}] ("${b.id}") has chapter ${b.chapter}, but there are ${cfg.chapters.length} chapters`);
    if (b.interactive) {
      req(typeof b.interactive.kind === "string",
        `beats[${i}] ("${b.id}").interactive needs a \`kind\` — it selects the component in interactives.tsx`);
    }
  });

  // Defaults kept here rather than in the template, so an old config picks up
  // a new option without being regenerated.
  return {
    root,
    slug: cfg.slug,
    title: cfg.title,
    handsOnLabel: cfg.handsOnLabel ?? "HANDS-ON",
    assets: cfg.assets ?? [],
    chapters: cfg.chapters,
    beats: cfg.beats.map((b) => ({
      id: b.id,
      chapter: b.chapter,
      interactive: b.interactive ?? null,
    })),
    voice: {
      provider: cfg.voice?.provider ?? "edge",
      name: cfg.voice?.name ?? "en-US-AndrewNeural",
      rate: cfg.voice?.rate ?? "+0%",
      modelId: cfg.voice?.modelId ?? "eleven_multilingual_v2",
    },
    /** Relative paths resolve against the lesson root, never the cwd. */
    out: isAbsolute(cfg.out ?? "") ? cfg.out : resolve(root, cfg.out ?? "dist"),
  };
};

export const paths = (cfg) => ({
  audio: join(cfg.root, "audio"),
  captions: join(cfg.root, "captions"),
  timings: join(cfg.root, "timings.json"),
  transcript: join(cfg.root, "transcript.txt"),
  generated: join(cfg.root, ".play"),
  manifest: join(cfg.root, ".play", "manifest.ts"),
  scenes: join(cfg.root, "scenes.tsx"),
  interactives: join(cfg.root, "interactives.tsx"),
});

/**
 * Parse `## <beat-id>` sections out of the transcript. Same shape the existing
 * video pipeline uses, so a transcript can move between the two unchanged.
 * Text before the first heading is preamble and ignored.
 */
export const parseTranscript = (text) => {
  const out = [];
  let id = null;
  let body = [];
  const flush = () => {
    if (id) out.push({ id, text: body.join(" ").replace(/\s+/g, " ").trim() });
    body = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      id = m[1];
    } else if (id && line.trim()) {
      body.push(line.trim());
    }
  }
  flush();
  return out.filter((s) => s.text.length);
};

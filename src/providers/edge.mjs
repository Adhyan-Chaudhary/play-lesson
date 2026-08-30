/**
 * edge-tts — free Microsoft neural TTS, no API key, no account.
 *
 * This is the default provider so that drafting a lesson costs nothing and
 * needs no permission. Its captions are estimated (see srt.mjs); its voices
 * are good enough to review pacing and cut beats against, which is what a
 * draft is for.
 *
 * Install: pipx install edge-tts   (or pip3 install --user edge-tts)
 */

import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../platform.mjs";
import { srtToWords } from "./srt.mjs";

export const name = "edge";
export const needsConsent = false;

export const check = async () => {
  try {
    await run("edge-tts", ["--version"]);
    return null;
  } catch {
    return "edge-tts is not on PATH. Install it with:  pipx install edge-tts";
  }
};

export const synth = async ({ text, mp3Path, voice, rate }) => {
  // Subtitles go to a temp file rather than beside the mp3: a failed run would
  // otherwise leave a stale .srt next to good audio and silently caption the
  // wrong beat on the next build.
  const srtPath = join(tmpdir(), `play-${process.pid}-${Date.now()}.srt`);

  try {
    await run("edge-tts", [
      "--voice", voice,
      "--rate", rate,
      "--text", text,
      "--write-media", mp3Path,
      "--write-subtitles", srtPath,
    ]);
    const words = srtToWords(await readFile(srtPath, "utf8"));
    return { words, estimated: true };
  } finally {
    await unlink(srtPath).catch(() => {});
  }
};


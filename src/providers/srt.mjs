/**
 * SRT → the caption shape the player reads: { words: [{ w, s, e }] }.
 *
 * edge-tts emits ONE CUE PER SENTENCE, not per word:
 *
 *   1
 *   00:00:00,050 --> 00:00:01,862
 *   So how do the two halves come together?
 *
 * so word times have to be estimated inside the cue. We split its span across
 * the words weighted by character length, which tracks speech better than an
 * equal split because longer words genuinely take longer to say.
 *
 * This is an APPROXIMATION and should be described as one: it is accurate at
 * the cue boundaries and drifts by up to ~150ms in the middle of a long
 * sentence. That is invisible in a caption band, which shows a whole line at a
 * time. Do not build word-level highlighting on it — use the ElevenLabs
 * provider, whose timings are measured rather than inferred.
 */

const tc = (s) => {
  const m = /(\d\d):(\d\d):(\d\d)[,.](\d\d\d)/.exec(s);
  if (!m) return 0;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
};

export const srtToWords = (srt) => {
  const words = [];

  for (const block of srt.trim().split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim());
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;

    const [from, to] = timeLine.split("-->").map(tc);
    const text = lines.slice(lines.indexOf(timeLine) + 1).join(" ").trim();
    if (!text) continue;

    const parts = text.split(/\s+/);
    // Punctuation is drawn but not spoken; weighting by letters only keeps a
    // word like "together?" from being handed the time of a 10-letter word.
    const weight = parts.map((w) => Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, "").length));
    const total = weight.reduce((a, b) => a + b, 0);

    let at = from;
    parts.forEach((w, i) => {
      const dur = ((to - from) * weight[i]) / total;
      words.push({
        w,
        s: Math.round(at * 1000) / 1000,
        e: Math.round((at + dur) * 1000) / 1000,
      });
      at += dur;
    });
  }

  return words;
};

/**
 * ElevenLabs returns per-CHARACTER start/end times. Fold them back into words
 * by walking the character stream and cutting on whitespace — so a word's span
 * is its first character's start to its last character's end, measured.
 */
export const alignmentToWords = (alignment) => {
  const chars = alignment?.characters ?? [];
  const starts = alignment?.character_start_times_seconds ?? [];
  const ends = alignment?.character_end_times_seconds ?? [];

  const words = [];
  let cur = "";
  let s = 0;

  const flush = (e) => {
    if (cur.trim()) words.push({ w: cur, s: Math.round(s * 1000) / 1000, e: Math.round(e * 1000) / 1000 });
    cur = "";
  };

  for (let i = 0; i < chars.length; i++) {
    if (/\s/.test(chars[i])) {
      flush(ends[i - 1] ?? starts[i] ?? 0);
      continue;
    }
    if (!cur) s = starts[i] ?? 0;
    cur += chars[i];
  }
  flush(ends[chars.length - 1] ?? 0);

  return words;
};

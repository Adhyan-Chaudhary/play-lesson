/**
 * Captions, driven by ElevenLabs word timestamps.
 *
 * The per-beat JSON is { words: [{w, s, e}] }. We group words into short lines
 * once, on load, then show whichever line contains the audio's current time —
 * so the band tracks the voice rather than a frame counter, and stays correct
 * through pause, seek and scrub for free.
 *
 * Styling follows broadcast subtitling (guide G7): white, centred, medium
 * weight, hard shadow, its own reserved row so it can never land on the visual.
 */

import { useEffect, useMemo, useState } from "react";
import { PLAY, FONT } from "./theme";

export type Word = { w: string; s: number; e: number };
type Line = { text: string; s: number; e: number };

/** Break on sentence punctuation, and otherwise every ~9 words, so a line is
 *  always readable in one glance and never splits a clause awkwardly. */
const toLines = (words: Word[]): Line[] => {
  const lines: Line[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    lines.push({
      text: cur.map((x) => x.w).join(" "),
      s: cur[0].s,
      e: cur[cur.length - 1].e,
    });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    const ends = /[.?!]$/.test(w.w);
    const comma = /[,;:—]$/.test(w.w);
    if (ends || (cur.length >= 9 && comma) || cur.length >= 13) flush();
  }
  flush();
  return lines;
};

/**
 * The share build inlines every beat's timings on `window.__PLAY_CAPTIONS`,
 * because a zip that someone unzips and double-clicks runs on file://, where
 * fetch is blocked by CORS. Audio and images load fine from file://; only this
 * needed inlining, and at ~92 KB it costs nothing.
 */
declare global {
  interface Window { __PLAY_CAPTIONS?: Record<string, { words: Word[] }> }
}

export const useCaptions = (base: string, beatId: string): Line[] => {
  const [words, setWords] = useState<Word[]>([]);
  useEffect(() => {
    let live = true;
    const inlined = typeof window !== "undefined" ? window.__PLAY_CAPTIONS?.[beatId] : undefined;
    if (inlined) {
      setWords(inlined.words ?? []);
      return;
    }
    setWords([]);
    fetch(`${base}/captions/${beatId}.json`)
      .then((r) => (r.ok ? r.json() : { words: [] }))
      .then((j) => live && setWords(j.words ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [base, beatId]);
  return useMemo(() => toLines(words), [words]);
};

export const CaptionBand: React.FC<{ words: Line[]; t: number }> = ({ words, t }) => {
  const line = words.find((l) => t >= l.s - 0.15 && t <= l.e + 0.35);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "8.5%",
        height: "17%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 8%",
        background: "#0B1017",
        borderTop: `1px solid ${PLAY.hairline}`,
        boxSizing: "border-box",
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          fontFamily: FONT.ui,
          fontSize: "clamp(13px, 1.85vw, 34px)",
          fontWeight: 500,
          lineHeight: 1.3,
          letterSpacing: -0.3,
          textAlign: "center",
          textWrap: "balance",
          color: "#FFFFFF",
          textShadow: "0 2px 6px rgba(0,0,0,0.9)",
        }}
      >
        {line?.text ?? ""}
      </span>
    </div>
  );
};

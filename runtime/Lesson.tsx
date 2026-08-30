/**
 * The positional-embeddings interactive lesson shell.
 *
 * ARCHITECTURE — two layers, and the split is the whole point:
 *
 *   .stage   transform: scale(...) to 1920x1080, POINTER-EVENTS: NONE
 *            Film visuals only. A pure function of lesson time.
 *   .ui      no transform, normal CSS pixels, percentage layout
 *            Chapter rail, caption band, transport, popups. Everything you touch.
 *
 * The previous prototype put buttons INSIDE the scaled/transformed subtree and
 * clicks did not register. Keeping every interactive element out of the
 * transformed layer removes that whole class of hit-testing problem, and has
 * two other benefits: text renders at real font sizes instead of being scaled,
 * and drag maths inside an interactive is 1:1 with no unprojection.
 *
 * THE CLOCK IS THE AUDIO. `time = beat.start + audio.currentTime`. Never a
 * requestAnimationFrame counter. That is what makes pause, seek and scrub fall
 * out for free and keeps captions locked to the voice — driving visuals from a
 * frame counter and playing audio alongside is how you get drift you can feel
 * but cannot name.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { BEATS, CHAPTERS, RUNTIME_SEC, HANDS_ON_LABEL, type Beat } from "@play/manifest";
import { PLAY, FONT } from "./theme";
import { Scene } from "@play/scenes";
import { Interactive } from "@play/interactives";
import { CaptionBand, useCaptions } from "./captions";

const W = 1920;
const H = 1080;
const BASE = "."; // audio/ and captions/ sit next to index.html

const clampNum = (v: number, lo: number, hi: number) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export const Lesson: React.FC = () => {
  const [i, setI] = useState(() => {
    if (typeof window === "undefined") return 0;
    const n = Number(new URLSearchParams(window.location.search).get("beat"));
    return Number.isFinite(n) && n >= 0 && n < BEATS.length ? Math.floor(n) : 0;
  }); // beat index
  const [t, setT] = useState(0); // seconds within the current beat
  const [playing, setPlaying] = useState(false);
  const [popup, setPopup] = useState<Beat | null>(() => {
    // ?open=1 opens this beat's interactive immediately. Without it a popup is
    // only reachable by playing its beat to the end, which makes both authoring
    // and review needlessly slow.
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search);
    if (q.get("open") !== "1") return null;
    const n = Math.floor(Number(q.get("beat")));
    const b = BEATS[n];
    return b?.interactive ? b : null;
  });
  const [skipAll, setSkipAll] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [scale, setScale] = useState(1);
  const [audioErr, setAudioErr] = useState<string | null>(null);

  /**
   * ?beat=N        start at a beat (deep-links a chapter from the lesson page)
   * ?p=0.0-1.0     with ?beat, freeze that far into it without playing audio
   *
   * The freeze mode exists because a published page is otherwise only
   * inspectable by sitting through it in real time — with it, every state of
   * the artefact can be screenshotted directly.
   */
  const params = useRef(
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search),
  );
  const frozen = params.current?.has("p") ?? false;

  const audio = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const beat = BEATS[i];
  const now = beat.start + t;
  const captions = useCaptions(BASE, beat.id);

  // ── fit the film layer to the frame ─────────────────────────────────
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── load the beat's audio whenever the beat changes ─────────────────
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    if (frozen) {
      const f = Number(params.current?.get("p") ?? 0);
      setT(clampNum(f, 0, 1) * beat.dur);
      return;
    }
    a.src = `${BASE}/audio/${beat.id}.mp3`;
    a.currentTime = 0;
    setT(0);
    if (playing) void a.play().catch(() => setPlaying(false));
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the clock ───────────────────────────────────────────────────────
  const onTime = () => {
    setT(audio.current?.currentTime ?? 0);
    if (audioErr) setAudioErr(null);
  };

  /**
   * Fail loudly. A missing audio/ folder used to leave the play button working
   * and nothing happening, with no clue why — which is exactly what someone
   * gets if they open index.html from INSIDE the zip instead of unzipping it
   * first, since Windows then extracts only that one file.
   */
  const onAudioError = () => {
    const src = audio.current?.currentSrc || `${BASE}/audio/${beat.id}.mp3`;
    setAudioErr(
      `Could not load the narration (${src.split("/").slice(-2).join("/")}). ` +
      `If you opened this from inside the .zip, unzip the whole folder first — ` +
      `index.html needs the audio folder beside it.`,
    );
    setPlaying(false);
  };

  const onEnded = useCallback(() => {
    // An interactive opens AFTER its beat's narration finishes, so the popup
    // never talks over the voice and the voice never talks over the popup.
    if (beat.interactive && !skipAll && !done[beat.id]) {
      setPopup(beat);
      setPlaying(false);
      return;
    }
    if (i < BEATS.length - 1) setI(i + 1);
    else setPlaying(false);
  }, [beat, i, skipAll, done]);

  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      void a.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [playing]);

  const goto = useCallback((idx: number) => {
    setPopup(null);
    setI(Math.max(0, Math.min(BEATS.length - 1, idx)));
  }, []);

  const closePopup = useCallback(
    (solved: boolean) => {
      if (popup) setDone((d) => ({ ...d, [popup.id]: true }));
      setPopup(null);
      const next = i + 1;
      if (next < BEATS.length) {
        setI(next);
        setPlaying(true);
        // the beat-change effect starts playback
      }
      void solved;
    },
    [popup, i],
  );

  // Kick off playback when asked, once the element exists.
  useEffect(() => {
    if (params.current?.get("play") !== "1") return;
    const a = audio.current;
    if (!a) return;
    a.src = `${BASE}/audio/${BEATS[i].id}.mp3`;
    void a.play().then(() => setPlaying(true)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── keyboard ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") { e.preventDefault(); toggle(); }
      if (e.key === "ArrowRight") goto(i + 1);
      if (e.key === "ArrowLeft") goto(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, goto, i]);

  const chapterStart = (c: number) => BEATS.findIndex((b) => b.chapter === c);

  /**
   * Every hands-on moment, with the lesson-time it fires at. A popup otherwise
   * only opens when a beat's audio ENDS, and the rail only seeks to a chapter's
   * FIRST beat — so without these markers the interactives are invisible until
   * you happen to sit through the right 50 seconds, and Next-beat silently
   * skips them. Marking them is the honest UX: you can see there are six, and
   * you can go straight to one.
   */
  const TRIES = BEATS
    .map((b, idx) => ({ b, idx, at: b.start + b.dur }))
    .filter((x) => x.b.interactive);

  const openInteractive = (idx: number) => {
    audio.current?.pause();
    setPlaying(false);
    setI(idx);
    setPopup(BEATS[idx]);
  };

  return (
    <div
      ref={frameRef}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 9",
        background: PLAY.void,
        overflow: "hidden",
        fontFamily: FONT.ui,
        color: PLAY.ink,
      }}
    >
      {/* ── film layer: visual only, never receives a pointer event ── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      >
        <Scene beat={beat} t={t} now={now} />
      </div>

      {/* ── ui layer: unscaled, everything interactive lives here ──── */}
      <ChapterRail
        chapter={beat.chapter}
        progress={now / RUNTIME_SEC}
        onSeek={(c) => goto(chapterStart(c))}
        tries={TRIES.map((x) => ({
          at: x.at / RUNTIME_SEC,
          idx: x.idx,
          title: x.b.interactive!.title,
          done: !!done[x.b.id],
        }))}
        onOpen={openInteractive}
      />

      <CaptionBand words={captions} t={t} />

      <Transport
        playing={playing}
        onToggle={toggle}
        onPrev={() => goto(i - 1)}
        onNext={() => goto(i + 1)}
        now={now}
        total={RUNTIME_SEC}
        skipAll={skipAll}
        onSkipAll={() => setSkipAll((v) => !v)}
      />

      {popup ? (
        <Interactive
          beat={popup}
          onSkip={() => closePopup(false)}
          onSolved={() => closePopup(true)}
        />
      ) : null}

      <FullscreenButton />

      <audio
        ref={audio}
        onTimeUpdate={onTime}
        onEnded={onEnded}
        onError={onAudioError}
        preload="none"
      />

      {audioErr ? (
        <div
          role="alert"
          style={{
            position: "absolute",
            left: "8%",
            right: "8%",
            bottom: "28%",
            padding: "16px 20px",
            borderRadius: 10,
            background: "rgba(255,107,107,0.12)",
            border: `1px solid ${PLAY.fail}`,
            color: PLAY.fail,
            font: `500 clamp(11px, 1.15vw, 18px) ${FONT.ui}`,
            lineHeight: 1.5,
            zIndex: 30,
          }}
        >
          {audioErr}
        </div>
      ) : null}
    </div>
  );
};

// ── chapter rail ──────────────────────────────────────────────────────
/**
 * Ten segments, not ten labels: at this chapter count, names side by side stop
 * being scannable. The current chapter is named beside the rail; every segment
 * is clickable to seek.
 */
const ChapterRail: React.FC<{
  chapter: number;
  progress: number;
  onSeek: (c: number) => void;
  tries: { at: number; idx: number; title: string; done: boolean }[];
  onOpen: (idx: number) => void;
}> = ({ chapter, progress, onSeek, tries, onOpen }) => (
  <div
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: "9%",
      display: "flex",
      alignItems: "center",
      gap: "1.4%",
      padding: "0 2.4%",
      background: PLAY.surface,
      borderBottom: `1px solid ${PLAY.hairline}`,
      boxSizing: "border-box",
    }}
  >
    <span
      style={{
        fontFamily: FONT.mono,
        fontSize: "clamp(10px, 1.15vw, 20px)",
        letterSpacing: 1.5,
        color: PLAY.heat,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {String(chapter + 1).padStart(2, "0")} / {CHAPTERS.length}
    </span>
    <span
      style={{
        fontSize: "clamp(12px, 1.45vw, 26px)",
        fontWeight: 600,
        letterSpacing: -0.3,
        whiteSpace: "nowrap",
        minWidth: "13em",
      }}
    >
      {CHAPTERS[chapter].short}
    </span>
    <div style={{ position: "relative", flex: 1, height: 8, display: "flex", gap: 4 }}>
      {CHAPTERS.map((c, n) => (
        <button
          key={c.short}
          title={c.full}
          onClick={() => onSeek(n)}
          style={{
            flex: 1,
            height: "100%",
            padding: 0,
            border: "none",
            borderRadius: 2,
            cursor: "pointer",
            background:
              n < chapter ? PLAY.heat
              : n === chapter ? PLAY.surfaceHi
              : PLAY.surfaceHi,
            opacity: n <= chapter ? 1 : 0.45,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {n === chapter ? (
            <span
              style={{
                position: "absolute",
                inset: 0,
                width: `${Math.min(100, Math.max(0, progress * 100))}%`,
                background: PLAY.heat,
              }}
            />
          ) : null}
        </button>
      ))}

      {/* hands-on markers — click to jump straight into one */}
      {tries.map((t) => (
        <button
          key={t.idx}
          onClick={() => onOpen(t.idx)}
          title={`Try it yourself — ${t.title}`}
          aria-label={`Open interactive: ${t.title}`}
          style={{
            position: "absolute",
            left: `${t.at * 100}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 15,
            height: 15,
            padding: 0,
            borderRadius: 999,
            cursor: "pointer",
            border: `2px solid ${PLAY.void}`,
            background: t.done ? PLAY.win : PLAY.heat,
            boxShadow: `0 0 0 1px ${t.done ? PLAY.win : PLAY.heat}`,
          }}
        />
      ))}
    </div>

    <span
      style={{
        fontFamily: FONT.mono,
        fontSize: "clamp(8px, 0.85vw, 14px)",
        letterSpacing: 1.2,
        color: PLAY.heat,
        whiteSpace: "nowrap",
      }}
    >
      ● {tries.length} {HANDS_ON_LABEL}
    </span>
  </div>
);

// ── transport ─────────────────────────────────────────────────────────
const Transport: React.FC<{
  playing: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  now: number;
  total: number;
  skipAll: boolean;
  onSkipAll: () => void;
}> = ({ playing, onToggle, onPrev, onNext, now, total, skipAll, onSkipAll }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: "8.5%",
      display: "flex",
      alignItems: "center",
      gap: "1.6%",
      padding: "0 2.4%",
      background: "rgba(10,14,20,0.86)",
      borderTop: `1px solid ${PLAY.hairline}`,
      boxSizing: "border-box",
    }}
  >
    <Ctl onClick={onPrev} label="Previous beat">◀◀</Ctl>
    <Ctl onClick={onToggle} primary label={playing ? "Pause" : "Play"}>
      {playing ? "❚❚" : "▶"}
    </Ctl>
    <Ctl onClick={onNext} label="Next beat">▶▶</Ctl>
    <span
      style={{
        fontFamily: FONT.mono,
        fontSize: "clamp(10px, 1.1vw, 19px)",
        color: PLAY.inkMuted,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {fmt(now)} / {fmt(total)}
    </span>
    <div style={{ flex: 1 }} />
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: FONT.mono,
        fontSize: "clamp(9px, 1vw, 17px)",
        letterSpacing: 1,
        color: skipAll ? PLAY.heat : PLAY.inkMuted,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <input
        type="checkbox"
        checked={skipAll}
        onChange={onSkipAll}
        style={{ accentColor: PLAY.heat, width: 16, height: 16, cursor: "pointer" }}
      />
      SKIP INTERACTIVES
    </label>
  </div>
);

/**
 * The embed sits in the lesson's prose column, which is about 700px wide — fine
 * for a video, tight for a 13-minute interactive with six popups. Fullscreen
 * targets the iframe's own document, so it needs `allowFullScreen` on the host
 * iframe; without it the request is rejected and we hide the control rather
 * than offer a button that does nothing.
 */
const FullscreenButton: React.FC = () => {
  const [on, setOn] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setOk(!!document.fullscreenEnabled);
    const h = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  if (!ok) return null;
  return (
    <button
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => {});
      }}
      aria-label={on ? "Exit fullscreen" : "Fullscreen"}
      title={on ? "Exit fullscreen" : "Fullscreen"}
      style={{
        position: "absolute",
        right: "2.4%",
        bottom: "9.6%",
        padding: "8px 14px",
        borderRadius: 8,
        border: `1px solid ${PLAY.hairlineHi}`,
        background: PLAY.scrim,
        color: PLAY.inkBody,
        font: `500 clamp(9px, 0.95vw, 15px) ${FONT.mono}`,
        letterSpacing: 1.2,
        cursor: "pointer",
        zIndex: 15,
      }}
    >
      {on ? "EXIT FULL" : "FULLSCREEN"}
    </button>
  );
};

const Ctl: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
  label: string;
}> = ({ onClick, children, primary, label }) => (
  <button
    onClick={onClick}
    aria-label={label}
    title={label}
    style={{
      width: primary ? "clamp(34px, 3.4vw, 62px)" : "clamp(26px, 2.6vw, 46px)",
      height: primary ? "clamp(34px, 3.4vw, 62px)" : "clamp(26px, 2.6vw, 46px)",
      borderRadius: 999,
      border: `1.5px solid ${primary ? PLAY.live : PLAY.hairlineHi}`,
      background: primary ? "rgba(76,201,240,0.14)" : "transparent",
      color: primary ? PLAY.live : PLAY.inkBody,
      fontSize: primary ? "clamp(12px, 1.2vw, 21px)" : "clamp(9px, 0.9vw, 15px)",
      cursor: "pointer",
      display: "grid",
      placeItems: "center",
      lineHeight: 1,
    }}
  >
    {children}
  </button>
);

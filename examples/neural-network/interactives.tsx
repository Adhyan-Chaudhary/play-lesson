/**
 * WORKED EXAMPLE — the popups for a neural-network lesson.
 *
 * Read this next to examples/positional-embeddings/interactives.tsx, which has
 * six of these on a completely different subject.
 *
 * THE CONTRACT, and why each clause is there:
 *   - opening pauses the narration (the shell does it before mounting this), so
 *     a popup never talks over the voice
 *   - always skippable, Esc included — a learner who is stuck must never be
 *     trapped by a puzzle they cannot solve
 *   - success is DERIVED FROM STATE. Both bodies below compute it from the
 *     network's actual output. Nothing awards success for clicking, dragging,
 *     or waiting, because a learner who is told they succeeded without the
 *     thing succeeding has learned the wrong lesson.
 *
 * THE OTHER THING TO COPY: both popups import net.ts, the same module the film
 * layer draws from. The learner is operating the artefact they were just shown,
 * not a lookalike.
 *
 * These render in the UI layer, NOT the scaled film layer — so pointer maths is
 * 1:1 and text is at real font size. A control inside the scaled subtree is how
 * clicks silently stop registering.
 */

import { useEffect, useMemo, useState } from "react";
import { PLAY, FONT, clamp, type Beat } from "@play/runtime";
import { DEFAULT_INPUT, IN_LABELS, OUT_LABELS, W0, W1, forward, winner } from "./net";

export const Interactive: React.FC<{
  beat: Beat;
  onSkip: () => void;
  onSolved: () => void;
}> = ({ beat, onSkip, onSolved }) => {
  const it = beat.interactive!;
  const [solved, setSolved] = useState(false);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onSkip();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onSkip]);

  const Body =
    it.kind === "weight" ? TuneWeight
    : it.kind === "classify" ? MakeItFire
    : Pending;

  return (
    <div
      style={{
        position: "absolute", inset: 0,
        background: "rgba(6,9,13,0.86)", backdropFilter: "blur(3px)",
        display: "grid", placeItems: "center", padding: "3%", zIndex: 20,
      }}
    >
      <div
        style={{
          width: "min(920px, 94%)",
          background: PLAY.surface,
          border: `1px solid ${PLAY.hairlineHi}`,
          borderRadius: 14,
          padding: "26px 30px 22px",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: 2, color: PLAY.heat }}>
          TRY IT YOURSELF
        </div>
        <h2 style={{ margin: "8px 0 4px", fontSize: 26, fontWeight: 600, letterSpacing: -0.4 }}>
          {it.title}
        </h2>
        <p style={{ margin: "0 0 18px", color: PLAY.inkBody, fontSize: 15 }}>{it.hint}</p>

        <Body onSolve={() => setSolved(true)} />

        <div style={{ display: "flex", gap: 12, marginTop: 22, alignItems: "center" }}>
          <button
            onClick={solved ? onSolved : onSkip}
            style={{
              padding: "10px 20px", borderRadius: 8,
              border: `1.5px solid ${solved ? PLAY.win : PLAY.hairlineHi}`,
              background: solved ? "rgba(71,230,160,0.14)" : "transparent",
              color: solved ? PLAY.win : PLAY.inkBody,
              fontSize: 14, fontWeight: 500, cursor: "pointer",
            }}
          >
            {solved ? "Continue →" : "Skip"}
          </button>
          {solved ? null : <span style={{ color: PLAY.inkMuted, fontSize: 13 }}>Esc also skips.</span>}
        </div>
      </div>
    </div>
  );
};

// ── shared bits ───────────────────────────────────────────────────────
const Slider: React.FC<{
  label: string; value: number; min: number; max: number; onChange: (v: number) => void; color?: string;
}> = ({ label, value, min, max, onChange, color = PLAY.learn }) => (
  <label style={{ display: "grid", gridTemplateColumns: "3.5em 1fr 4em", alignItems: "center", gap: 12 }}>
    <span style={{ fontFamily: FONT.mono, fontSize: 15, color: PLAY.inkBody }}>{label}</span>
    <input
      type="range" min={min} max={max} step={0.01} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: "100%", accentColor: color, cursor: "pointer" }}
    />
    <span style={{ fontFamily: FONT.mono, fontSize: 15, color: PLAY.ink, textAlign: "right" }}>
      {value.toFixed(2)}
    </span>
  </label>
);

/** A live readout of the two output neurons. Amber marks the current winner. */
const Outputs: React.FC<{ out: number[]; target?: number }> = ({ out, target }) => {
  const win = winner(out);
  return (
    <div style={{ display: "flex", gap: 14, marginTop: 18 }}>
      {out.map((v, i) => {
        const isWin = i === win;
        const hit = target !== undefined && isWin && i === target;
        const color = hit ? PLAY.win : isWin ? PLAY.heat : PLAY.inkMuted;
        return (
          <div
            key={OUT_LABELS[i]}
            style={{
              flex: 1, padding: "12px 14px", borderRadius: 10,
              border: `1.5px solid ${isWin ? color : PLAY.hairline}`,
              background: isWin ? "rgba(255,255,255,0.04)" : "transparent",
            }}
          >
            <div style={{ fontFamily: FONT.mono, fontSize: 13, color, letterSpacing: 1.5 }}>
              {OUT_LABELS[i]}{isWin ? " · WINNING" : ""}
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 26, color: PLAY.ink, marginTop: 4 }}>
              {v.toFixed(3)}
            </div>
            {/* the bar IS the number — reading the length is reading the value */}
            <div style={{ height: 6, background: PLAY.surfaceHi, borderRadius: 3, marginTop: 8 }}>
              <div style={{ width: `${clamp(v) * 100}%`, height: "100%", background: color, borderRadius: 3 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── 1. drag one weight ────────────────────────────────────────────────
/**
 * Success = the learner drove output B above 0.5 by moving ONE number. The
 * point is not the threshold; it is that a weight is a dial with a visible
 * consequence, which is hard to feel from a static diagram.
 */
const TuneWeight: React.FC<{ onSolve: () => void }> = ({ onSolve }) => {
  const [w, setW] = useState(W0[2][0]);

  const out = useMemo(() => {
    const w0 = W0.map((r) => [...r]);
    w0[2][0] = w;
    return forward(DEFAULT_INPUT, w0, W1).out;
  }, [w]);

  const done = out[1] > 0.5;
  useEffect(() => {
    if (done) onSolve();
  }, [done, onSolve]);

  return (
    <div>
      <Slider label="w₃₁" value={w} min={-3} max={3} onChange={setW} />
      <Outputs out={out} target={1} />
      <p style={{ color: done ? PLAY.win : PLAY.inkMuted, fontSize: 14, marginTop: 14, minHeight: "1.4em" }}>
        {done
          ? "That is all training does — it moves numbers like this one."
          : "One weight, one dial. Push B past 0.5."}
      </p>
    </div>
  );
};

// ── 2. choose the inputs ──────────────────────────────────────────────
/**
 * Success = B beats A on a real forward pass. Deriving it from `winner()`
 * rather than from a rule about slider positions means an unexpected route to
 * the answer still counts — which is the difference between exploring and
 * guessing a password.
 */
const MakeItFire: React.FC<{ onSolve: () => void }> = ({ onSolve }) => {
  const [xs, setXs] = useState([...DEFAULT_INPUT]);
  /**
   * Whether the learner has actually moved something yet.
   *
   * This exists to honour the colour rule. "A is still winning" is a FAILURE
   * message, and red is only legal on an attempt the viewer watched fail —
   * so on first paint, before anyone has touched a slider, the same sentence
   * has to be grey. Deriving red from `!solved` alone would paint the popup
   * red the instant it opens and scold the learner for not having started.
   */
  const [tried, setTried] = useState(false);

  const out = useMemo(() => forward(xs).out, [xs]);
  const done = winner(out) === 1;

  useEffect(() => {
    if (done) onSolve();
  }, [done, onSolve]);

  return (
    <div>
      <div style={{ display: "grid", gap: 10 }}>
        {xs.map((v, i) => (
          <Slider
            key={IN_LABELS[i]}
            label={IN_LABELS[i]}
            value={v}
            min={-1}
            max={1}
            onChange={(nv) => {
              setTried(true);
              setXs(xs.map((o, j) => (j === i ? nv : o)));
            }}
          />
        ))}
      </div>
      <Outputs out={out} target={1} />
      <p
        style={{
          // Red is legal only on an attempt the learner watched fail — never on
          // an option they simply have not tried yet. Hence `tried`.
          color: done ? PLAY.win : tried ? PLAY.fail : PLAY.inkMuted,
          fontSize: 14, marginTop: 14, minHeight: "1.4em",
        }}
      >
        {done
          ? "B wins. You changed the answer without touching a single weight."
          : "A is still winning. Same network, different question put to it."}
      </p>
    </div>
  );
};

const Pending: React.FC<{ onSolve: () => void }> = () => (
  <div style={{ color: PLAY.fail, fontFamily: FONT.mono, fontSize: 14 }}>
    No component for this interactive kind yet — add a case above.
  </div>
);

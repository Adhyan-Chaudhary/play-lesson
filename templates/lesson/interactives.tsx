/**
 * "Try it yourself" popups.
 *
 * These live in the UI layer, NOT inside the scaled film layer — so pointer
 * maths is 1:1, text renders at real font size, and there is no transformed
 * subtree between the pointer and the handler. Putting a button inside the
 * scaled layer is how clicks silently stop registering.
 *
 * Contract for every one of them:
 *   - opening PAUSES the narration (the shell does that before mounting this)
 *   - it is always skippable, and skipping resumes immediately
 *   - success is DERIVED from the actual state, never awarded by a timer
 *
 * `beat.interactive.kind` selects the body. Add a case per kind.
 */

import { useEffect, useState } from "react";
import { PLAY, FONT, type Beat } from "@play/runtime";

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

  const Body = it.kind === "demo" ? Demo : Pending;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(6,9,13,0.86)",
        backdropFilter: "blur(3px)",
        display: "grid",
        placeItems: "center",
        padding: "3%",
        zIndex: 20,
      }}
    >
      <div
        style={{
          width: "min(880px, 92%)",
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
              padding: "10px 20px",
              borderRadius: 8,
              border: `1.5px solid ${solved ? PLAY.win : PLAY.hairlineHi}`,
              background: solved ? "rgba(71,230,160,0.14)" : "transparent",
              color: solved ? PLAY.win : PLAY.inkBody,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {solved ? "Continue →" : "Skip"}
          </button>
          {solved ? null : (
            <span style={{ color: PLAY.inkMuted, fontSize: 13 }}>Esc also skips.</span>
          )}
        </div>
      </div>
    </div>
  );
};

/** Replace with the real thing. Success is derived from state — note that the
 *  button below does not "award" it, the value crossing the threshold does. */
const Demo: React.FC<{ onSolve: () => void }> = ({ onSolve }) => {
  const [v, setV] = useState(0);

  useEffect(() => {
    if (v > 80) onSolve();
  }, [v, onSolve]);

  return (
    <div>
      <input
        type="range"
        min={0}
        max={100}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        style={{ width: "100%", accentColor: PLAY.learn }}
      />
      <div style={{ fontFamily: FONT.mono, color: v > 80 ? PLAY.win : PLAY.inkBody, marginTop: 10 }}>
        {v > 80 ? "solved — that is the behaviour" : `value ${v}`}
      </div>
    </div>
  );
};

const Pending: React.FC<{ onSolve: () => void }> = () => (
  <div style={{ color: PLAY.fail, fontFamily: FONT.mono, fontSize: 14 }}>
    No component for this interactive kind yet — add a case in interactives.tsx.
  </div>
);

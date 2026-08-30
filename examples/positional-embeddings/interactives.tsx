/**
 * "Try it yourself" popups.
 *
 * These live in the UI layer, NOT inside the scaled film layer — so pointer
 * maths is 1:1, text is at real font size, and there is no transformed subtree
 * between the pointer and the handler.
 *
 * Contract for every one of them:
 *   - opening PAUSES the narration (the shell does that before mounting this)
 *   - it is always skippable, and skipping resumes immediately
 *   - success is DERIVED from the actual state, never awarded by a timer
 */

import { useEffect, useMemo, useState } from "react";
import type { Beat } from "@play/manifest";
import { PLAY, FONT, clamp } from "@play/theme";
import { colDim, omega, pe } from "./stream";

// ── deterministic pseudo-vectors so a run is reproducible ─────────────
const rnd = (seed: number) => {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280) * 2 - 1;
};
const vec = (seed: number, n: number) => {
  const r = rnd(seed);
  return Array.from({ length: n }, r);
};
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = (a: number[]) => Math.sqrt(dot(a, a));
const cos = (a: number[], b: number[]) => dot(a, b) / (norm(a) * norm(b) || 1);

// ── popup chrome ──────────────────────────────────────────────────────
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
    it.kind === "reorder" ? Reorder
    : it.kind === "dims" ? Dims
    : it.kind === "lookup" ? Lookup
    : it.kind === "shift" ? Shift
    : it.kind === "clocks" ? ClockDial
    : it.kind === "gap" ? Gap
    : Pending;

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
          width: "min(1100px, 94%)",
          maxHeight: "94%",
          overflow: "auto",
          background: PLAY.surface,
          border: `1px solid ${PLAY.hairlineHi}`,
          borderRadius: 16,
          padding: "clamp(16px, 2.2vw, 34px)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{
          fontFamily: FONT.mono, fontSize: "clamp(9px, 0.95vw, 15px)",
          letterSpacing: 3, color: PLAY.heat, marginBottom: 10,
        }}>
          TRY IT YOURSELF
        </div>
        <h2 style={{
          margin: "0 0 6px", fontFamily: FONT.ui,
          fontSize: "clamp(16px, 1.9vw, 32px)", fontWeight: 600,
          letterSpacing: -0.6, color: PLAY.ink,
        }}>
          {it.title}
        </h2>
        <p style={{
          margin: "0 0 20px", fontSize: "clamp(11px, 1.15vw, 19px)",
          color: PLAY.inkBody, lineHeight: 1.5,
        }}>
          {it.hint}
        </p>

        <Body onSolved={() => setSolved(true)} />

        <div style={{
          display: "flex", alignItems: "center", gap: 14, marginTop: 22,
          borderTop: `1px solid ${PLAY.hairline}`, paddingTop: 18,
        }}>
          <button onClick={onSkip} style={ghost}>Skip</button>
          <div style={{ flex: 1 }} />
          <button
            onClick={onSolved}
            disabled={!solved}
            style={{
              ...primary,
              opacity: solved ? 1 : 0.32,
              cursor: solved ? "pointer" : "not-allowed",
              borderColor: solved ? PLAY.win : PLAY.hairlineHi,
              color: solved ? PLAY.win : PLAY.inkMuted,
            }}
          >
            Got it →
          </button>
        </div>
      </div>
    </div>
  );
};

const ghost: React.CSSProperties = {
  font: `500 clamp(11px,1.1vw,18px) ${FONT.ui}`,
  color: PLAY.inkMuted, background: "transparent",
  border: `1px solid ${PLAY.hairline}`, borderRadius: 999,
  padding: "10px 22px", cursor: "pointer",
};
const primary: React.CSSProperties = {
  font: `600 clamp(11px,1.1vw,18px) ${FONT.ui}`,
  background: "transparent", border: `1.5px solid ${PLAY.win}`,
  borderRadius: 999, padding: "10px 26px",
};

type BodyProps = { onSolved: () => void };

// ── §03 · reorder the sentence, attention will not budge ──────────────
/**
 * Honest: q, k and v are functions of the TOKEN only, never of the slot. So
 * permuting the sentence permutes the rows and columns of the weight grid while
 * every token's output vector stays bit-identical. The learner is invited to
 * disprove that and cannot, which is the whole argument of chapter 3.
 */
const Reorder: React.FC<BodyProps> = ({ onSolved }) => {
  const WORDS = ["the", "cat", "sat", "down"];
  const [order, setOrder] = useState([0, 1, 2, 3]);
  const [pick, setPick] = useState<number | null>(null);
  const [tries, setTries] = useState(0);

  // token-only projections
  const K = useMemo(() => WORDS.map((_, i) => vec(i * 7 + 3, 6)), []);
  const V = useMemo(() => WORDS.map((_, i) => vec(i * 11 + 5, 6)), []);
  const Q = useMemo(() => WORDS.map((_, i) => vec(i * 13 + 2, 6)), []);

  const weights = (qi: number) => {
    const raw = order.map((j) => Math.exp(dot(Q[qi], K[j]) * 1.5));
    const z = raw.reduce((a, b) => a + b, 0);
    return raw.map((r) => r / z);
  };
  const outFor = (qi: number) => {
    const w = weights(qi);
    return V[0].map((_, d) => order.reduce((s, j, n) => s + w[n] * V[j][d], 0));
  };

  const catOut = outFor(1);

  const swap = (n: number) => {
    if (pick === null) { setPick(n); return; }
    if (pick === n) { setPick(null); return; }
    const o = [...order];
    [o[pick], o[n]] = [o[n], o[pick]];
    setOrder(o);
    setPick(null);
    const t = tries + 1;
    setTries(t);
    if (t >= 4) onSolved();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        {order.map((w, n) => (
          <button key={n} onClick={() => swap(n)}
            style={{
              font: `600 clamp(13px,1.5vw,26px) ${FONT.ui}`,
              padding: "12px 22px", borderRadius: 10, cursor: "pointer",
              background: pick === n ? "rgba(184,146,255,0.22)" : PLAY.surfaceHi,
              border: `1.5px solid ${pick === n ? PLAY.learn : PLAY.hairline}`,
              color: PLAY.ink,
            }}>
            {WORDS[w]}
          </button>
        ))}
        <span style={{
          alignSelf: "center", marginLeft: 8, fontFamily: FONT.mono,
          fontSize: "clamp(10px,1vw,16px)", color: PLAY.inkMuted,
        }}>
          {pick === null ? "click two words to swap them" : "click another word"}
          {"  ·  ATTEMPTS "}{String(tries).padStart(2, "0")}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        <Panel title="attention weights — cat's row">
          <div style={{ display: "flex", gap: 8 }}>
            {weights(1).map((w, n) => (
              <div key={n} style={{ flex: 1, textAlign: "center" }}>
                <div style={{
                  height: 60, borderRadius: 5, background: PLAY.live,
                  opacity: 0.15 + 0.85 * w,
                }} />
                <div style={{
                  marginTop: 6, fontFamily: FONT.mono,
                  fontSize: "clamp(8px,0.85vw,13px)", color: PLAY.inkMuted,
                }}>
                  {WORDS[order[n]]}
                </div>
                <div style={{
                  fontFamily: FONT.mono, fontSize: "clamp(8px,0.85vw,13px)",
                  color: PLAY.inkBody,
                }}>
                  {w.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
          <Note>The columns move when you reorder. That is all that moves.</Note>
        </Panel>

        <Panel title="cat's output vector">
          <div style={{ display: "flex", gap: 6 }}>
            {catOut.map((v, n) => (
              <div key={n} style={{ flex: 1 }}>
                <div style={{
                  height: 60, borderRadius: 5,
                  background: tries >= 4 ? PLAY.win : PLAY.inkMuted,
                  opacity: 0.2 + 0.8 * clamp((v + 1) / 2),
                }} />
                <div style={{
                  marginTop: 6, fontFamily: FONT.mono,
                  fontSize: "clamp(7px,0.78vw,12px)", color: PLAY.inkMuted,
                  textAlign: "center",
                }}>
                  {v.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
          <Note tone={tries >= 4 ? "win" : undefined}>
            {tries >= 4
              ? "Four different sentences. Identical output. Attention sees a bag."
              : "Watch these numbers while you reorder."}
          </Note>
        </Panel>
      </div>
    </div>
  );
};

// ── §06 · high-dimensional near-orthogonality ─────────────────────────
const Dims: React.FC<BodyProps> = ({ onSolved }) => {
  const [d, setD] = useState(2);
  useEffect(() => { if (d >= 400) onSolved(); }, [d, onSolved]);

  // Average |cos| over several random pairs — the spread is the point.
  const stats = useMemo(() => {
    const samples = Array.from({ length: 24 }, (_, k) =>
      Math.abs(cos(vec(k * 17 + 1, d), vec(k * 29 + 7, d))));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    return { mean, predicted: 1 / Math.sqrt(d) };
  }, [d]);

  return (
    <div>
      <input type="range" min={2} max={512} value={d}
        onChange={(e) => setD(+e.target.value)}
        style={{ width: "100%", accentColor: PLAY.learn, cursor: "pointer" }} />
      <div style={{
        display: "flex", gap: 28, marginTop: 18, flexWrap: "wrap",
        fontFamily: FONT.mono, fontSize: "clamp(11px,1.25vw,22px)",
      }}>
        <Stat label="d" value={String(d)} color={PLAY.learn} />
        <Stat label="mean |cos(x, p)|" value={stats.mean.toFixed(3)}
          color={stats.mean < 0.12 ? PLAY.win : PLAY.fail} />
        <Stat label="1 / √d" value={stats.predicted.toFixed(3)} color={PLAY.inkMuted} />
      </div>
      <Note tone={d >= 400 ? "win" : undefined}>
        {d < 20
          ? "At this width the token vector and the position vector genuinely collide."
          : d < 400
          ? "Keep going. Watch the measured value track one over root d."
          : "At 512 they are effectively independent channels — which is why plain addition works."}
      </Note>
    </div>
  );
};

// ── §02b · one-hot times E is the lookup ──────────────────────────────
const Lookup: React.FC<BodyProps> = ({ onSolved }) => {
  const ROWS = 12;
  const [sel, setSel] = useState(0);
  const [moved, setMoved] = useState(0);
  const E = useMemo(() => Array.from({ length: ROWS }, (_, r) => vec(r * 5 + 1, 6)), []);

  const pick = (r: number) => {
    setSel(r);
    const m = moved + 1;
    setMoved(m);
    if (m >= 3) onSolved();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 24 }}>
      <div>
        <div style={{
          fontFamily: FONT.mono, fontSize: "clamp(9px,0.9vw,14px)",
          color: PLAY.inkMuted, marginBottom: 8,
        }}>one-hot</div>
        {Array.from({ length: ROWS }, (_, r) => (
          <button key={r} onClick={() => pick(r)}
            style={{
              display: "block", width: 54, height: 22, marginBottom: 3,
              borderRadius: 4, cursor: "pointer",
              border: `1px solid ${r === sel ? PLAY.learn : PLAY.hairline}`,
              background: r === sel ? PLAY.learn : "transparent",
              color: r === sel ? PLAY.void : PLAY.inkMuted,
              font: `600 12px ${FONT.mono}`,
            }}>
            {r === sel ? "1" : "0"}
          </button>
        ))}
      </div>
      <div>
        <div style={{
          fontFamily: FONT.mono, fontSize: "clamp(9px,0.9vw,14px)",
          color: PLAY.inkMuted, marginBottom: 8,
        }}>table E — the row that falls out is highlighted</div>
        {E.map((row, r) => (
          <div key={r} style={{
            display: "flex", gap: 4, marginBottom: 3,
            opacity: r === sel ? 1 : 0.22,
          }}>
            {row.map((v, c) => (
              <div key={c} style={{
                width: 44, height: 22, borderRadius: 4,
                background: r === sel ? PLAY.live : PLAY.inkMuted,
                opacity: 0.2 + 0.8 * clamp((v + 1) / 2),
              }} />
            ))}
            <span style={{
              marginLeft: 8, fontFamily: FONT.mono, fontSize: 12,
              color: r === sel ? PLAY.live : PLAY.inkMuted, lineHeight: "22px",
            }}>
              row {r}
            </span>
          </div>
        ))}
        <Note tone={moved >= 3 ? "win" : undefined}>
          {moved >= 3
            ? "The multiply never did anything but point at a row."
            : "Move the 1. The product is always exactly that row of E."}
        </Note>
      </div>
    </div>
  );
};


// ── §04b · try to invent a shift-linear position code ─────────────────
/**
 * The honest failure that makes chapter 7 a payoff instead of a formula
 * reveal. We ask for ONE fixed matrix M_k with p(pos + k) = M_k · p(pos) for
 * EVERY pos. The learner tries the two obvious codes:
 *
 *   integer  p(pos) = pos.  A 1x1 matrix m must satisfy m·pos = pos + k for all
 *            pos, so m = 1 + k/pos — different for every position. No single
 *            matrix exists. (Addition would work, but that is a bias, not a
 *            linear map, and it is exactly what a linear layer cannot fold in
 *            per-position.)
 *   random   p(pos) is unrelated to p(pos+k) by construction, so the best
 *            single matrix is no better than noise.
 *
 * Both fail, on the arithmetic, in front of them.
 */
const Shift: React.FC<BodyProps> = ({ onSolved }) => {
  const [tried, setTried] = useState<Record<string, boolean>>({});
  const [kind, setKind] = useState<"integer" | "random" | null>(null);
  const K = 3;
  const POS = [0, 1, 2, 5, 9];

  const pick = (k: "integer" | "random") => {
    setKind(k);
    const t = { ...tried, [k]: true };
    setTried(t);
    if (t.integer && t.random) onSolved();
  };

  // the single scalar/matrix each position WOULD need
  const rows = POS.map((pos) => {
    if (kind === "integer") {
      const need = pos === 0 ? Infinity : (pos + K) / pos;
      return { pos, need: pos === 0 ? "impossible" : need.toFixed(2) };
    }
    const a = Math.sin(pos * 12.9898) * 43758.5453;
    const b = Math.sin((pos + K) * 12.9898) * 43758.5453;
    const av = a - Math.floor(a), bv = b - Math.floor(b);
    return { pos, need: (bv / (av || 1)).toFixed(2) };
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        {(["integer", "random"] as const).map((k) => (
          <button key={k} onClick={() => pick(k)} style={{
            font: `600 clamp(11px,1.2vw,19px) ${FONT.ui}`, padding: "11px 20px",
            borderRadius: 10, cursor: "pointer", color: PLAY.ink,
            background: kind === k ? "rgba(184,146,255,0.2)" : PLAY.surfaceHi,
            border: `1.5px solid ${kind === k ? PLAY.learn : PLAY.hairline}`,
          }}>
            {k === "integer" ? "p(pos) = pos" : "p(pos) = random vector"}
            {tried[k] ? "  ✓" : ""}
          </button>
        ))}
      </div>
      {kind ? (
        <>
          <div style={{ fontFamily: FONT.mono, fontSize: "clamp(10px,1.05vw,17px)", color: PLAY.inkMuted, marginBottom: 8 }}>
            the multiplier each position would need, for k = {K}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {rows.map((r) => (
              <div key={r.pos} style={{
                padding: "10px 16px", borderRadius: 8, background: PLAY.surfaceHi,
                border: `1px solid ${PLAY.fail}`, fontFamily: FONT.mono,
                fontSize: "clamp(10px,1.05vw,17px)",
              }}>
                <span style={{ color: PLAY.inkMuted }}>pos {r.pos} → </span>
                <span style={{ color: PLAY.fail }}>{r.need}</span>
              </div>
            ))}
          </div>
          <Note tone={tried.integer && tried.random ? "win" : undefined}>
            {tried.integer && tried.random
              ? "Every position wants a different matrix — so no single fixed one exists. That is the requirement neither code can meet."
              : "A different number for every position. One fixed matrix cannot do this. Try the other code too."}
          </Note>
        </>
      ) : (
        <Note>Pick a code and we will test it against every position at once.</Note>
      )}
    </div>
  );
};

// ── §07a · the clocks ─────────────────────────────────────────────────
/** Position is not stored in any one channel. Position is the reading of all
 *  the clocks at once — which is only believable if you turn them yourself. */
const ClockDial: React.FC<BodyProps> = ({ onSolved }) => {
  const [pos, setPos] = useState(0);
  const [span_, setSpan] = useState(0);
  useEffect(() => { if (span_ > 26) onSolved(); }, [span_, onSolved]);
  const N = 8;
  const dims = Array.from({ length: N }, (_, k) => colDim(Math.round((k / (N - 1)) * 63)));

  return (
    <div>
      <input type="range" min={0} max={47} value={pos}
        onChange={(e) => { const v = +e.target.value; setSpan((s) => s + Math.abs(v - pos)); setPos(v); }}
        style={{ width: "100%", accentColor: PLAY.learn, cursor: "pointer" }} />
      <div style={{ fontFamily: FONT.mono, fontSize: "clamp(11px,1.2vw,20px)", color: PLAY.learn, margin: "10px 0 18px" }}>
        pos = {pos}
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        {dims.map((i) => {
          const a = pos * omega(i) * 6;
          const R = 40;
          return (
            <div key={i} style={{ textAlign: "center" }}>
              <svg width={R * 2 + 6} height={R * 2 + 6}>
                <g transform={`translate(${R + 3} ${R + 3})`}>
                  <circle r={R} fill="rgba(184,146,255,0.05)" stroke={PLAY.hairlineHi} strokeWidth={2} />
                  <line x1={0} y1={0} x2={Math.cos(a) * (R - 7)} y2={-Math.sin(a) * (R - 7)}
                    stroke={PLAY.learn} strokeWidth={4} strokeLinecap="round" />
                  <circle r={3.5} fill={PLAY.learn} />
                </g>
              </svg>
              <div style={{ fontFamily: FONT.mono, fontSize: 12, color: PLAY.inkMuted }}>i={i}</div>
            </div>
          );
        })}
      </div>
      <Note tone={span_ > 26 ? "win" : undefined}>
        {span_ > 26
          ? "The fast hands on the left separate neighbouring positions; the slow ones on the right barely move. Together they are a unique fingerprint."
          : "Sweep the position. Notice the left-hand hands racing and the right-hand ones crawling."}
      </Note>
    </div>
  );
};

// ── §07c · keep the gap, break the readout ────────────────────────────
/**
 * p(pos) · p(pos+k) = sum of cos(k·omega_i) — a function of the GAP alone. The
 * learner is invited to move both markers anywhere while holding the gap and
 * watch the number refuse to change. It is an honest failure: it cannot be
 * broken, because the arithmetic here is the real thing.
 */
const Gap: React.FC<BodyProps> = ({ onSolved }) => {
  const [start, setStart] = useState(4);
  const [gap, setGap] = useState(6);
  const [moves, setMoves] = useState(0);
  useEffect(() => { if (moves >= 4) onSolved(); }, [moves, onSolved]);

  const dotAt = (a: number, b: number) => {
    let s = 0;
    for (let c = 0; c < 64; c++) s += pe(a, colDim(c)) * pe(b, colDim(c));
    return s;
  };
  const value = dotAt(start, start + gap);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 18px", alignItems: "center" }}>
        <span style={{ fontFamily: FONT.mono, fontSize: "clamp(10px,1.05vw,17px)", color: PLAY.inkBody }}>
          move both (start)
        </span>
        <input type="range" min={0} max={30} value={start}
          onChange={(e) => { setStart(+e.target.value); setMoves((m) => m + 1); }}
          style={{ accentColor: PLAY.heat, cursor: "pointer" }} />
        <span style={{ fontFamily: FONT.mono, fontSize: "clamp(10px,1.05vw,17px)", color: PLAY.inkBody }}>
          the gap k
        </span>
        <input type="range" min={1} max={16} value={gap}
          onChange={(e) => setGap(+e.target.value)}
          style={{ accentColor: PLAY.learn, cursor: "pointer" }} />
      </div>

      <div style={{ display: "flex", gap: 30, marginTop: 20, alignItems: "baseline", flexWrap: "wrap" }}>
        <Stat label="positions" value={`${start} , ${start + gap}`} color={PLAY.heat} />
        <Stat label="gap k" value={String(gap)} color={PLAY.learn} />
        <Stat label="p(pos) · p(pos + k)" value={value.toFixed(4)} color={PLAY.win} />
      </div>

      <Note tone={moves >= 4 ? "win" : undefined}>
        {moves >= 4
          ? "The dot product never moved. Attention is built out of dot products, so relative distance is readable by machinery that is already there."
          : "Drag the top slider. Both positions move together; watch the bottom number."}
      </Note>
    </div>
  );
};

// ── not yet built ─────────────────────────────────────────────────────
const Pending: React.FC<BodyProps> = ({ onSolved }) => {
  useEffect(() => { onSolved(); }, [onSolved]);
  return (
    <div style={{
      padding: 28, borderRadius: 10, border: `1px dashed ${PLAY.hairlineHi}`,
      color: PLAY.inkMuted, fontSize: "clamp(11px,1.15vw,18px)",
    }}>
      This interactive is not built yet — continue, or use Skip. The narration
      around it is already in place.
    </div>
  );
};

// ── small shared bits ─────────────────────────────────────────────────
const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div style={{
      fontFamily: FONT.mono, fontSize: "clamp(9px,0.9vw,14px)",
      letterSpacing: 1.4, color: PLAY.inkMuted, marginBottom: 10,
    }}>
      {title.toUpperCase()}
    </div>
    {children}
  </div>
);

const Note: React.FC<{ children: React.ReactNode; tone?: "win" }> = ({ children, tone }) => (
  <p style={{
    margin: "14px 0 0", fontSize: "clamp(10px,1.05vw,17px)", lineHeight: 1.5,
    color: tone === "win" ? PLAY.win : PLAY.inkBody,
  }}>
    {children}
  </p>
);

const Stat: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div>
    <div style={{ fontSize: "0.62em", color: PLAY.inkMuted, letterSpacing: 1.2 }}>
      {label.toUpperCase()}
    </div>
    <div style={{ color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
  </div>
);

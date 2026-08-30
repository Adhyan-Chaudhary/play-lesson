/**
 * THE RESIDUAL STREAM — the one artefact this whole lesson is built on.
 *
 * Three staves, one per token, each a band of d channels running left to right.
 * Every chapter asks the same question of the same object: what is written into
 * the stream, and who reads it?
 *
 *   token content   cyan, written by a lookup from E
 *   position        violet, written as waves at geometrically spaced rates
 *   the sum         both, in the same band, on near-orthogonal channels
 *
 * This is not a metaphor invented for the video — "added into the residual
 * stream" is the lesson's own language, so the picture is the thing itself.
 *
 * The wave field is CANVAS, not SVG. It is 64 channels x 48 positions animating
 * continuously; in SVG that is thousands of nodes a frame. On canvas it is free,
 * and it can move smoothly rather than in keyframe steps — which is a thing the
 * rendered-video version of this lesson could not have afforded at all.
 */

import { useEffect, useRef } from "react";
import { PLAY, clamp, lerp } from "@play/theme";

// ── geometry ──────────────────────────────────────────────────────────
export const STAGE = { top: 97, bot: 805 };
export const STREAM = {
  x: 430,
  w: 1150,
  staveH: 96,
  gap: 30,
  channels: 64, // drawn; d is 512 in the narration
};
export const streamY = (r: number) => {
  const total = 3 * STREAM.staveH + 2 * STREAM.gap;
  const top = (STAGE.top + STAGE.bot) / 2 - total / 2;
  return top + r * (STREAM.staveH + STREAM.gap);
};

// ── the maths the picture is actually drawing ─────────────────────────
/**
 * PE(pos, 2i)   = sin(pos / 10000^(2i/d))
 * PE(pos, 2i+1) = cos(pos / 10000^(2i/d))
 *
 * NOTE ON DIRECTION. Small i gives a denominator near 1, so the LEFT-hand
 * channels turn FAST and the right-hand channels turn slowly. (The lesson MDX
 * currently states this the other way round.)
 */
/**
 * Drawn column -> real dimension index, spread geometrically across all of d.
 *
 * Columns are mapped in PAIRS. Each frequency owns a (sin, cos) pair, and a
 * naive linear map lands consecutive columns on mismatched parity — adjacent
 * cells then showed sin of one frequency beside cos of another, and the field
 * broke into stripes. Pairing keeps each frequency's two channels adjacent,
 * which is both what the encoding actually is and what makes it legible.
 */
export const colDim = (c: number, cols = STREAM.channels, d = 512) => {
  const pairs = Math.max(1, Math.floor(cols / 2) - 1);
  const f = Math.floor(c / 2);
  return 2 * Math.round((f / pairs) * (d / 2 - 1)) + (c % 2);
};

export const omega = (i: number, d = 512) => 1 / Math.pow(10000, (2 * Math.floor(i / 2)) / d);
export const pe = (pos: number, i: number, d = 512) => {
  const a = pos * omega(i, d);
  return i % 2 === 0 ? Math.sin(a) : Math.cos(a);
};
/** Token "content" — deterministic, and deliberately not wave-like, so the two
 *  layers read as different KINDS of signal rather than two of the same. */
export const tok = (t: number, i: number) =>
  Math.sin(i * 1.37 + t * 2.9) * 0.55 + Math.sin(i * 0.41 + t * 5.1) * 0.45;

// ── canvas: the wave field ────────────────────────────────────────────
/**
 * The classic positional-encoding heatmap, alive. Rows are positions, columns
 * are channels. Owns its own rAF loop and reads state through a ref, so it
 * animates at 60fps regardless of how often the audio clock ticks the shell.
 */
export const WaveField: React.FC<{
  x: number; y: number; w: number; h: number;
  rows: number;
  /** 0 → invisible, 1 → full field */
  amount: number;
  /** highlighted position row, or null */
  mark: number | null;
  mark2?: number | null;
}> = ({ x, y, w, h, rows, amount, mark, mark2 = null }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ amount, mark, mark2 });
  state.current = { amount, mark, mark2 };

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const cols = STREAM.channels;
    const cw = w / cols;
    const ch = h / rows;

    const draw = () => {
      const { amount: a, mark: m, mark2: m2 } = state.current;
      ctx.clearRect(0, 0, w, h);
      if (a > 0.01) {
        for (let r = 0; r < rows; r++) {
          const lit = m === r || m2 === r;
          for (let c = 0; c < cols; c++) {
            const v = pe(r, colDim(c, cols));
            const inten = (v + 1) / 2;
            // violet: position is a thing you can move
            const alpha = (0.06 + 0.72 * inten) * a * (lit ? 1 : 0.5);
            ctx.fillStyle = `rgba(184,146,255,${alpha.toFixed(3)})`;
            ctx.fillRect(c * cw, r * ch, cw - 0.6, ch - 0.6);
          }
          if (lit) {
            ctx.strokeStyle = "rgba(255,184,77,0.95)";
            ctx.lineWidth = 2;
            ctx.strokeRect(-1, r * ch - 1, w + 2, ch + 2);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [w, h, rows]);

  return (
    <foreignObject x={x} y={y} width={w} height={h}>
      <canvas ref={ref} width={w} height={h} style={{ width: w, height: h, display: "block" }} />
    </foreignObject>
  );
};

// ── one stave ─────────────────────────────────────────────────────────
export const Stave: React.FC<{
  row: number;
  token: string;
  /** cyan content amplitude 0→1 */
  tokenIn: number;
  /** violet position amplitude 0→1 */
  posIn: number;
  /** 0 = two visibly separate layers, 1 = one fused band */
  fuse: number;
  /** extra width, for the concatenation argument in chapter 9 */
  widen?: number;
  dim?: number;
  /** Chapters 7-8 shrink the staves so the wave field can be the subject. */
  compact?: boolean;
  t: number;
}> = ({ row, token, tokenIn, posIn, fuse, widen = 0, dim = 1, compact = false, t }) => {
  const y = compact ? STAGE.top + 40 + row * 58 : streamY(row);
  const w = STREAM.w * (1 + widen);
  const cw = w / STREAM.channels;
  const h = compact ? 46 : STREAM.staveH;
  const half = h / 2;

  return (
    <g opacity={dim}>
      {/* the empty stream: always there, even before anything is written */}
      <rect x={STREAM.x} y={y} width={w} height={h} rx={6}
        fill="rgba(255,255,255,0.018)" stroke={PLAY.hairline} strokeWidth={1} />

      {Array.from({ length: STREAM.channels }, (_, c) => {
        const tv = (tok(row + 1, c) + 1) / 2;
        const pv = (pe(row, colDim(c)) + 1) / 2;
        // Unfused: token occupies the top half, position the bottom half — two
        // visibly separate signals. Fused: both fill the full height and
        // interleave, which is what "added into the same stream" looks like.
        const tH = lerp(half, h, fuse);
        const pH = lerp(half, h, fuse);
        const tY = y;
        const pY = lerp(y + half, y, fuse);
        return (
          <g key={c}>
            {tokenIn > 0.01 ? (
              <rect x={STREAM.x + c * cw} y={tY} width={Math.max(1, cw - 1.6)} height={tH}
                fill={PLAY.live} opacity={(0.08 + 0.62 * tv) * clamp(tokenIn) * (1 - fuse * 0.35)} />
            ) : null}
            {posIn > 0.01 ? (
              <rect x={STREAM.x + c * cw} y={pY} width={Math.max(1, cw - 1.6)} height={pH}
                fill={PLAY.learn} opacity={(0.08 + 0.62 * pv) * clamp(posIn) * (1 - fuse * 0.35)} />
            ) : null}
          </g>
        );
      })}

      <text x={STREAM.x - 26} y={y + h / 2 + 10} textAnchor="end"
        fill={PLAY.ink} fontFamily="Inter, sans-serif" fontSize={30} fontWeight={600}>
        {token}
      </text>
      <text x={STREAM.x - 26} y={y + h / 2 + 36} textAnchor="end"
        fill={PLAY.learn} fontFamily="JetBrains Mono, monospace" fontSize={19}
        opacity={clamp(posIn)}>
        {`pos ${row}`}
      </text>
    </g>
  );
};

// ── attention beams (chapter 3) ───────────────────────────────────────
/**
 * Arcs from cat's stave to every stave, thickness = attention weight. The
 * weights are computed from the TOKEN only, never the slot — so when `order`
 * permutes, the beams follow the words and the readout at the end of cat's
 * stave does not move. That invariance is the chapter's whole claim, and it is
 * real arithmetic here rather than an animation of it.
 */
export const Beams: React.FC<{ order: number[]; amount: number; from?: number }> = ({
  order, amount, from = 1,
}) => {
  if (amount <= 0.01) return null;
  const W_ = [0.18, 0.52, 0.3];
  const x0 = STREAM.x + STREAM.w + 14;
  const xOut = x0 + 150;
  const yFrom = streamY(order.indexOf(from)) + STREAM.staveH / 2;
  return (
    <g opacity={clamp(amount)}>
      {order.map((tokIdx, slot) => {
        const y1 = streamY(slot) + STREAM.staveH / 2;
        const w = W_[tokIdx];
        const bow = 70;
        return (
          <path key={tokIdx}
            d={`M${x0} ${y1} C${x0 + bow} ${y1}, ${xOut - bow} ${yFrom}, ${xOut} ${yFrom}`}
            fill="none" stroke={PLAY.live} strokeWidth={2 + 12 * w} opacity={0.22 + 0.6 * w} />
        );
      })}
      {/* cat's output — the thing that refuses to move however you reorder */}
      <g transform={`translate(${xOut} ${yFrom})`}>
        <rect x={0} y={-34} width={132} height={68} rx={8}
          fill="rgba(76,201,240,0.10)" stroke={PLAY.live} strokeWidth={1.5} />
        {[0, 1, 2, 3, 4].map((k) => (
          <rect key={k} x={12 + k * 22} y={-18} width={15} height={36} rx={3}
            fill={PLAY.live} opacity={0.25 + 0.6 * ((Math.sin(k * 2.1) + 1) / 2)} />
        ))}
        <text y={54} x={66} textAnchor="middle" fill={PLAY.live}
          fontFamily="JetBrains Mono, monospace" fontSize={17}>
          cat out
        </text>
      </g>
    </g>
  );
};

// ── clock row (chapter 7) ─────────────────────────────────────────────
/** Each dimension pair is a hand turning at its own rate. Position is not in
 *  any one of them — position is the reading of all of them at once. */
export const Clocks: React.FC<{ pos: number; amount: number; y: number; n?: number }> = ({
  pos, amount, y, n = 8,
}) => {
  if (amount <= 0.01) return null;
  const r = 46;
  const step = STREAM.w / n;
  return (
    <g opacity={clamp(amount)}>
      {Array.from({ length: n }, (_, k) => {
        const i = colDim(Math.round((k / (n - 1)) * (STREAM.channels - 1)));
        const a = pos * omega(i) * 6;
        const cx = STREAM.x + step * k + step / 2;
        return (
          <g key={k} transform={`translate(${cx} ${y})`}>
            <circle r={r} fill="rgba(184,146,255,0.05)" stroke={PLAY.hairlineHi} strokeWidth={2} />
            <line x1={0} y1={0} x2={Math.cos(a) * (r - 8)} y2={-Math.sin(a) * (r - 8)}
              stroke={PLAY.learn} strokeWidth={5} strokeLinecap="round" />
            <circle r={4} fill={PLAY.learn} />
            <text y={r + 26} textAnchor="middle" fill={PLAY.inkMuted}
              fontFamily="JetBrains Mono, monospace" fontSize={17}>
              {`i=${i}`}
            </text>
          </g>
        );
      })}
    </g>
  );
};

// ── two arrows, and the angle between them (chapter 6) ────────────────
/** As d climbs, two random vectors become almost exactly perpendicular. The
 *  angle snapping to 90 degrees IS the reason plain addition does not corrupt. */
export const Orthogonality: React.FC<{
  cx: number; cy: number; d: number; amount: number;
}> = ({ cx, cy, d, amount }) => {
  if (amount <= 0.01) return null;
  const R = 150;
  // measured, not asserted: cosine of two deterministic pseudo-random vectors
  let dot = 0, na = 0, nb = 0;
  let s1 = 12345, s2 = 67890;
  for (let k = 0; k < d; k++) {
    s1 = (s1 * 9301 + 49297) % 233280;
    s2 = (s2 * 4021 + 12983) % 233280;
    const a = (s1 / 233280) * 2 - 1;
    const b = (s2 / 233280) * 2 - 1;
    dot += a * b; na += a * a; nb += b * b;
  }
  const c = dot / (Math.sqrt(na * nb) || 1);
  const ang = Math.acos(clamp(c, -1, 1));
  return (
    <g opacity={clamp(amount)} transform={`translate(${cx} ${cy})`}>
      <line x1={0} y1={0} x2={R} y2={0} stroke={PLAY.live} strokeWidth={5} strokeLinecap="round" />
      <text x={R + 16} y={6} fill={PLAY.live} fontFamily="JetBrains Mono, monospace" fontSize={22}>x</text>
      <line x1={0} y1={0} x2={Math.cos(ang) * R} y2={-Math.sin(ang) * R}
        stroke={PLAY.learn} strokeWidth={5} strokeLinecap="round" />
      <text x={Math.cos(ang) * (R + 22)} y={-Math.sin(ang) * (R + 22)}
        fill={PLAY.learn} fontFamily="JetBrains Mono, monospace" fontSize={22}>p</text>
      <path d={`M40 0 A40 40 0 0 0 ${Math.cos(ang) * 40} ${-Math.sin(ang) * 40}`}
        fill="none" stroke={PLAY.inkMuted} strokeWidth={2} />
      <text x={54} y={-26} fill={PLAY.inkBody} fontFamily="JetBrains Mono, monospace" fontSize={22}>
        {`${((ang * 180) / Math.PI).toFixed(1)}°`}
      </text>
      <text x={0} y={64} fill={PLAY.inkMuted} fontFamily="JetBrains Mono, monospace" fontSize={20}>
        {`d = ${d}   cos = ${c.toFixed(3)}`}
      </text>
    </g>
  );
};

// ── the wall of E (chapter 2) ─────────────────────────────────────────
/** A lookup is a reach into a wall and a pull, not a calculation. */
export const TableE: React.FC<{ amount: number; pick: number; rows?: number }> = ({
  amount, pick, rows = 14,
}) => {
  if (amount <= 0.01) return null;
  const x = 90, y = STAGE.top + 60, w = 250, rh = (STAGE.bot - 120 - y) / rows;
  return (
    <g opacity={clamp(amount)}>
      <text x={x} y={y - 20} fill={PLAY.inkMuted} fontFamily="JetBrains Mono, monospace" fontSize={20}>
        E — |V| x d
      </text>
      {Array.from({ length: rows }, (_, r) => (
        <rect key={r} x={x} y={y + r * rh} width={w} height={rh - 4} rx={3}
          fill={r === pick ? PLAY.live : PLAY.inkMuted}
          opacity={r === pick ? 0.85 : 0.12}
          stroke={r === pick ? PLAY.live : "none"} strokeWidth={1.5} />
      ))}
      <path d={`M${x + w + 10} ${y + pick * rh + rh / 2} L${STREAM.x - 90} ${streamY(0) + STREAM.staveH / 2}`}
        stroke={PLAY.live} strokeWidth={2} strokeDasharray="7 6" opacity={0.7} fill="none" />
    </g>
  );
};

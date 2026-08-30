/**
 * The film layer — pure visuals, a function of lesson time, no pointer events.
 *
 * ONE ARTEFACT: the residual stream (see stream.tsx). Every beat is a STATE of
 * that same object — what is written into it, and who reads it — never a fresh
 * diagram. Chapters change what is lit, widened, overlaid or annotated.
 *
 * COLOUR RULE: cyan = token content (what flows), violet = position (what you
 * can move), mint = solved, amber = a marker or a score, red = a failed attempt.
 */

import type { Beat } from "@play/manifest";
import { PLAY, FONT, clamp, lerp, span, easeOut } from "@play/theme";
import {
  Beams, Clocks, Orthogonality, STAGE, STREAM, Stave, TableE, WaveField, streamY,
} from "./stream";

const W = 1920;
const H = 1080;
const TOKENS = ["the", "cat", "sat"];

// ── hand-set formulas ─────────────────────────────────────────────────
/**
 * Deliberately NOT KaTeX. The point of putting a formula on screen here is to
 * light up individual terms as the narration reaches them, and KaTeX's
 * generated markup fights per-term targeting. Hand-set tspans give exact
 * control and ship no font files.
 */
type Part = { k: string; t: string; sub?: string; sup?: string };
const Formula: React.FC<{
  x: number; y: number; parts: Part[]; lit?: string[]; size?: number; o?: number;
}> = ({ x, y, parts, lit = [], size = 46, o = 1 }) => (
  <text x={x} y={y} textAnchor="middle" fontFamily={FONT.mono} fontSize={size} opacity={clamp(o)}>
    {parts.map((p, i) => {
      const on = lit.includes(p.k);
      const col =
        p.k.startsWith("p") ? PLAY.learn
        : p.k.startsWith("x") || p.k.startsWith("z") ? PLAY.live
        : PLAY.inkBody;
      return (
        <tspan key={i} fill={on ? col : PLAY.inkMuted} opacity={on ? 1 : 0.45}>
          {p.t}
          {p.sub ? <tspan fontSize={size * 0.6} dy={size * 0.18}>{p.sub}<tspan dy={-size * 0.18} /></tspan> : null}
          {p.sup ? <tspan fontSize={size * 0.6} dy={-size * 0.34}>{p.sup}<tspan dy={size * 0.34} /></tspan> : null}
        </tspan>
      );
    })}
  </text>
);

const F_FUSE: Part[] = [
  { k: "z", t: "z", sub: "pos" }, { k: "eq", t: "  =  " },
  { k: "x", t: "x", sub: "pos" }, { k: "plus", t: "  +  " },
  { k: "p", t: "p", sub: "pos" },
];
const F_PE: Part[] = [
  { k: "pe", t: "PE" }, { k: "args", t: "(pos, 2i)" }, { k: "eq", t: "  =  " },
  { k: "sin", t: "sin" }, { k: "open", t: "( " },
  { k: "pos", t: "pos" }, { k: "div", t: " / " },
  { k: "base", t: "10000", sup: "2i/d" }, { k: "close", t: " )" },
];
const F_SHIFT: Part[] = [
  { k: "p", t: "p" }, { k: "arg", t: "(pos + k)" }, { k: "eq", t: "  =  " },
  { k: "M", t: "M", sub: "k" }, { k: "dot", t: " · " }, { k: "p2", t: "p" }, { k: "arg2", t: "(pos)" },
];
const F_CONCAT: Part[] = [
  { k: "W", t: "W[x ; p]" }, { k: "eq", t: "  =  " },
  { k: "Wx", t: "W", sub: "x" }, { k: "x", t: "x" }, { k: "plus", t: "  +  " },
  { k: "Wp", t: "W", sub: "p" }, { k: "p", t: "p" },
];

// ── the opening hero ──────────────────────────────────────────────────
/** Drawn OVER the stream while the stream is already forming behind it, then
 *  dissolved before the first beat lands — so the lesson opens on a person and
 *  still contains no cut. */
const Hero: React.FC<{ o: number }> = ({ o }) => {
  if (o <= 0.01) return null;
  const cy = (STAGE.top + STAGE.bot) / 2;
  const P = 300;
  return (
    <g opacity={clamp(o)}>
      <rect x={0} y={STAGE.top} width={W} height={STAGE.bot - STAGE.top}
        fill={PLAY.void} opacity={0.66} />
      <g transform={`translate(500 ${cy})`}>
        <clipPath id="heroclip">
          <rect x={-P / 2} y={-P / 2} width={P} height={P} rx={22} />
        </clipPath>
        {/* The real lesson puts a portrait here. An example ships no asset,
            so this is the frame it would sit in. */}
        <rect x={-P / 2} y={-P / 2} width={P} height={P} rx={22}
          fill={PLAY.surfaceHi} clipPath="url(#heroclip)" />
        <rect x={-P / 2 - 5} y={-P / 2 - 5} width={P + 10} height={P + 10} rx={26}
          fill="none" stroke={PLAY.live} strokeWidth={2} opacity={0.6} />
      </g>
      <g transform={`translate(716 ${cy})`}>
        <text y={-78} fill={PLAY.live} fontFamily={FONT.mono} fontSize={23} letterSpacing={5}>
          YOUR COURSE NAME · INTERACTIVE
        </text>
        <text y={4} fill={PLAY.ink} fontFamily={FONT.ui} fontSize={78} fontWeight={600} letterSpacing={-2.2}>
          Your Name
        </text>
        <text y={52} fill={PLAY.inkBody} fontFamily={FONT.ui} fontSize={30}>Your role</text>
        <text y={124} fill={PLAY.inkBody} fontFamily={FONT.ui} fontSize={33} fontWeight={500}>
          Positional embeddings — telling the model where each token sits.
        </text>
      </g>
    </g>
  );
};

// ── small on-stage annotation ─────────────────────────────────────────
const Note: React.FC<{ x: number; y: number; children: React.ReactNode; color?: string; size?: number; o?: number; anchor?: "start" | "middle" | "end" }> =
  ({ x, y, children, color = PLAY.inkBody, size = 27, o = 1, anchor = "middle" }) => (
    <text x={x} y={y} textAnchor={anchor} fill={color} fontFamily={FONT.mono}
      fontSize={size} opacity={clamp(o)} letterSpacing={1}>
      {children}
    </text>
  );

// ── the director ──────────────────────────────────────────────────────
export const Scene: React.FC<{ beat: Beat; t: number; now: number }> = ({ beat, t }) => {
  const p = clamp(t / Math.max(0.001, beat.dur));
  const id = beat.id;
  const is = (s: string) => id.startsWith(s);

  // Continuous state of the one artefact. Written as accumulating truths, not
  // per-scene branches: once the stream carries content it never loses it.
  const tokenIn =
    is("01") ? span(p, 0.55, 0.95) * 0.18
    : is("02a") ? span(p, 0.15, 0.6)
    : 1;
  const posIn =
    is("04b") ? span(p, 0.55, 1) * 0.4
    : is("05") ? 0.55
    : is("06a") ? span(p, 0.2, 0.8)
    : is("06") || is("07") || is("08") || is("09") || is("10") ? 1
    : 0;
  const fuse =
    is("06c") ? easeOut(span(p, 0.15, 0.75))
    : is("07") || is("08") ? 1
    : is("09") ? 1 - span(p, 0.15, 0.5) * 0.85
    : is("10") ? 1
    : 0;

  // chapter-specific overlays
  const heroO = is("01") ? Math.min(span(t, 0.8, 2.4), 1 - span(t, 8.5, 10.5)) : 0;
  const tableO = is("02a") || is("02b") || is("02e") ? span(p, 0.1, 0.4) : 0;
  const pick = is("02b") ? 3 + Math.floor(p * 7) % 9 : 6;
  const beamO = is("03") ? span(p, 0.2, 0.55) : 0;
  const order = is("03b") && p > 0.35 ? [2, 0, 1] : [0, 1, 2];
  const waveO = is("07") || is("08") ? span(p, 0.1, 0.5) : 0;
  const clockO = is("07a") ? span(p, 0.35, 0.8) : is("07b") ? 1 : 0;
  const orthoD = is("06b") ? Math.round(lerp(2, 64, easeOut(p))) : is("06c") ? Math.round(lerp(64, 512, easeOut(p))) : 0;
  const orthoO = is("06b") || is("06c") ? span(p, 0.1, 0.4) : 0;
  const widen = is("09") ? span(p, 0.2, 0.55) * 0.34 * (1 - span(p, 0.62, 0.85)) : 0;
  const wavePos = Math.floor(lerp(0, 46, (Math.sin(t * 0.5) + 1) / 2));

  const dx = Math.sin(t * 0.19) * 5;
  const dy = Math.cos(t * 0.14) * 3.5;
  const cy = (STAGE.top + STAGE.bot) / 2;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <defs>
        <clipPath id="stage">
          <rect x={0} y={STAGE.top} width={W} height={STAGE.bot - STAGE.top} />
        </clipPath>
        <radialGradient id="lift">
          <stop offset="0%" stopColor={PLAY.live} stopOpacity={0.07} />
          <stop offset="100%" stopColor={PLAY.live} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={PLAY.void} />
      <ellipse cx={W / 2} cy={cy} rx={980} ry={430} fill="url(#lift)" />

      <g clipPath="url(#stage)">
        <g transform={`translate(${dx.toFixed(2)} ${dy.toFixed(2)})`}>
          {/* the wave field sits UNDER the staves — position is written into
              the same stream, not alongside it */}
          {/* The field is the subject in 07/08, so it gets its own panel BELOW
              the staves rather than being drawn under them — overlaying the two
              made both illegible. */}
          {waveO > 0.01 ? (
            <>
              <WaveField x={STREAM.x} y={STAGE.top + 300} w={STREAM.w} h={210} rows={48}
                amount={waveO} mark={is("07c") ? 12 : wavePos}
                mark2={is("07c") ? 12 + 9 : null} />
              <Note x={STREAM.x - 26} y={STAGE.top + 320} color={PLAY.inkMuted} size={19} anchor="end">
                pos
              </Note>
              <Note x={STREAM.x - 26} y={STAGE.top + 500} color={PLAY.inkMuted} size={19} anchor="end">
                47
              </Note>
              <Note x={STREAM.x} y={STAGE.top + 285} color={PLAY.inkMuted} size={19} anchor="start">
                fast  ·  i = 0
              </Note>
              <Note x={STREAM.x + STREAM.w} y={STAGE.top + 285} color={PLAY.inkMuted} size={19} anchor="end">
                i = 510  ·  slow
              </Note>
              {/* The flat right-hand end is not a rendering fault, it is the
                  encoding: the slowest channels barely turn across a short
                  sentence, which is exactly how they carry long range. */}
              <Note x={STREAM.x + STREAM.w} y={STAGE.top + 542} color={PLAY.inkMuted} size={18} anchor="end">
                the slow end barely moves across 48 positions — that is long range
              </Note>
            </>
          ) : null}

          <TableE amount={tableO} pick={pick} />

          {order.map((tokIdx, slot) => (
            <Stave key={tokIdx} row={slot} token={TOKENS[tokIdx]}
              tokenIn={tokenIn} posIn={posIn} fuse={fuse} widen={widen} t={t}
              dim={is("02") && slot > 0 ? 0.4 : waveO > 0.01 ? 0.42 : 1}
              compact={waveO > 0.01} />
          ))}

          <Beams order={order} amount={beamO} />
          <Clocks pos={wavePos * 2.4} amount={clockO} y={STAGE.bot - 92} />
          <Orthogonality cx={W / 2} cy={STAGE.bot - 170} d={Math.max(2, orthoD)} amount={orthoO} />

          {/* ── formulas, lit term by term as the narration reaches them ── */}
          {is("04b") ? (
            <Formula x={W / 2} y={STAGE.top + 92} parts={F_SHIFT}
              lit={p > 0.6 ? ["p", "arg", "eq", "M", "dot", "p2", "arg2"] : ["p", "arg"]}
              o={span(p, 0.25, 0.5)} />
          ) : null}
          {is("06a") || is("06c") ? (
            <Formula x={W / 2} y={STAGE.top + 92} parts={F_FUSE}
              lit={is("06c") ? ["z", "eq", "x", "plus", "p"] : p > 0.5 ? ["x", "plus", "p"] : ["x"]}
              o={span(p, 0.15, 0.45)} />
          ) : null}
          {is("07b") ? (
            <Formula x={W / 2} y={STAGE.top + 88} parts={F_PE}
              lit={
                p < 0.3 ? ["pe", "args"]
                : p < 0.6 ? ["pe", "args", "eq", "sin", "open", "pos", "close"]
                : ["pe", "args", "eq", "sin", "open", "pos", "div", "base", "close"]
              }
              o={span(p, 0.1, 0.3)} size={44} />
          ) : null}
          {is("09") ? (
            <Formula x={W / 2} y={STAGE.top + 88} parts={F_CONCAT}
              lit={p > 0.45 ? ["W", "eq", "Wx", "x", "plus", "Wp", "p"] : ["W"]}
              o={span(p, 0.1, 0.35)} />
          ) : null}

          {/* ── numbers that carry an argument ── */}
          {is("02c") ? (
            <>
              <Note x={W / 2} y={STAGE.bot - 96} color={PLAY.fail} size={40} o={span(p, 0.3, 0.6)}>
                6.6 GB per batch
              </Note>
              <Note x={W / 2} y={STAGE.bot - 52} color={PLAY.inkMuted} size={24} o={span(p, 0.55, 0.8)}>
                cos(cat, dog) = 0     cos(cat, subpoena) = 0
              </Note>
            </>
          ) : null}
          {is("02d") ? (
            <Note x={W / 2} y={STAGE.bot - 70} color={PLAY.live} size={32} o={span(p, 0.3, 0.6)}>
              50,257 words → 768 directions
            </Note>
          ) : null}
          {is("02e") ? (
            <>
              <Note x={215} y={STAGE.bot - 60} color={PLAY.inkBody} size={26}>E : |V| × d</Note>
              <Note x={STREAM.x + STREAM.w / 2} y={STAGE.bot - 60} color={PLAY.live} size={26}>
                one sequence : L × d
              </Note>
            </>
          ) : null}
          {is("03b") ? (
            <Note x={W / 2} y={STAGE.bot - 62} color={p > 0.45 ? PLAY.win : PLAY.inkMuted}
              size={30} o={span(p, 0.35, 0.6)}>
              same bag → same output
            </Note>
          ) : null}
          {is("04a") ? (
            <Note x={STREAM.x + STREAM.w + 90} y={cy} color={PLAY.fail} size={64} o={span(p, 0.3, 0.6)} anchor="start">
              5000
            </Note>
          ) : null}
          {is("07c") ? (
            <Note x={W / 2} y={STAGE.bot - 60} color={PLAY.win} size={30} o={span(p, 0.4, 0.7)}>
              p(pos) · p(pos + k) depends only on k
            </Note>
          ) : null}
          {is("08") ? (
            <Note x={W / 2} y={STAGE.bot - 60} color={PLAY.inkBody} size={26} o={span(p, 0.4, 0.7)}>
              learned : 1024 × 768 rows — and nothing past row 1024
            </Note>
          ) : null}

          <Hero o={heroO} />
        </g>
      </g>
    </svg>
  );
};

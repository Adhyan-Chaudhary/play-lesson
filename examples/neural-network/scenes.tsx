/**
 * WORKED EXAMPLE — the film layer for a neural-network lesson.
 *
 * Read this next to examples/positional-embeddings/scenes.tsx. The subjects are
 * unrelated, the technique is identical, and that is the point: the pattern
 * transfers, the drawing does not.
 *
 * ONE ARTEFACT: a single 3-4-2 network (net.ts). It is on stage from the first
 * frame to the last. No beat draws a new diagram — beats zoom in on it, light
 * parts of it, push signal through it, and annotate it. If you find yourself
 * writing a second top-level graphic, you have started making slides.
 *
 * WHAT THIS EXAMPLE IS SHOWING YOU
 *   1. `p` is the only clock. Every animation is a function of progress through
 *      the beat, so pause, seek and scrub are correct for free.
 *   2. Beats overlap on one object. `zoom` and `flow` are continuous properties
 *      of the artefact, not separate scenes.
 *   3. The interactive and the film share net.ts, so a weight the learner drags
 *      is the same weight the film draws.
 *   4. Nothing on screen is a text card restating the narration. If the voice
 *      says signal flows, a signal moves.
 *
 * COLOUR RULE: cyan = signal flowing · violet = what the learner can move ·
 * mint = solved · amber = a marker or score · red ONLY on a watched failure.
 */

import { PLAY, FONT, clamp, lerp, span, easeOut, type Beat } from "@play/runtime";
import {
  DEFAULT_INPUT, IN_LABELS, LAYERS, NODE_R, OUT_LABELS,
  STAGE, activations, edgeWeight, layerX, nodeY, W0, W1,
} from "./net";

const W = 1920;
const H = 1080;

// ── the artefact ──────────────────────────────────────────────────────
/**
 * The whole network, drawn once. Every beat renders THIS, varying its props.
 *
 * `flow` (0-1) is a wavefront sweeping left to right: an edge carries signal
 * once the front passes it, and a node lights once the front reaches it. That
 * is what makes a forward pass read as a thing happening rather than as a
 * before/after pair of pictures.
 */
const Network: React.FC<{
  act: number[][];
  flow?: number;
  zoom?: number;
  litEdge?: { layer: number; to: number; from: number } | null;
  dim?: number;
}> = ({ act, flow = 1, zoom = 0, litEdge = null, dim = 1 }) => {
  // Zooming is a transform on the artefact, not a different drawing of it.
  const k = lerp(1, 2.1, easeOut(clamp(zoom)));
  const fx = layerX(0) + 180;
  const fy = nodeY(1, 0);
  const tx = lerp(0, W / 2 - fx * k, easeOut(clamp(zoom)));
  const ty = lerp(0, (STAGE.top + STAGE.bot) / 2 - fy * k, easeOut(clamp(zoom)));

  const front = flow * (LAYERS.length - 1);

  return (
    <g transform={`translate(${tx} ${ty}) scale(${k})`} opacity={dim}>
      {/* edges first, so nodes sit on top of them */}
      {[W0, W1].map((mat, layer) =>
        mat.map((row, to) =>
          row.map((w, from) => {
            const x1 = layerX(layer);
            const y1 = nodeY(layer, from);
            const x2 = layerX(layer + 1);
            const y2 = nodeY(layer + 1, to);
            const carried = clamp(front - layer);
            const isLit = litEdge && litEdge.layer === layer && litEdge.to === to && litEdge.from === from;
            return (
              <g key={`${layer}-${to}-${from}`}>
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={PLAY.hairlineHi}
                  strokeWidth={1 + edgeWeight(w) * 2.5}
                  opacity={0.5}
                />
                {/* the signal itself, revealed as the wavefront passes */}
                <line
                  x1={x1} y1={y1}
                  x2={lerp(x1, x2, carried)} y2={lerp(y1, y2, carried)}
                  stroke={isLit ? PLAY.learn : PLAY.live}
                  strokeWidth={(isLit ? 4 : 1.5) + edgeWeight(w) * 3}
                  opacity={(isLit ? 1 : 0.85) * edgeWeight(w)}
                  strokeLinecap="round"
                />
              </g>
            );
          }),
        ),
      )}

      {/* nodes */}
      {LAYERS.map((n, layer) =>
        Array.from({ length: n }, (_, i) => {
          const a = act[layer]?.[i] ?? 0;
          const reached = clamp(front - layer + 1);
          // Activation drives fill opacity: a neuron that barely fires is
          // barely there. Reading brightness IS reading the number.
          const lit = clamp(Math.abs(a)) * reached;
          return (
            <g key={`n-${layer}-${i}`}>
              <circle
                cx={layerX(layer)} cy={nodeY(layer, i)} r={NODE_R}
                fill={PLAY.live} opacity={lit * 0.9}
              />
              <circle
                cx={layerX(layer)} cy={nodeY(layer, i)} r={NODE_R}
                fill="none" stroke={PLAY.hairlineHi} strokeWidth={2}
              />
              <text
                x={layerX(layer)} y={nodeY(layer, i) + 7}
                textAnchor="middle" fontFamily={FONT.mono} fontSize={20}
                fill={lit > 0.55 ? PLAY.void : PLAY.inkBody}
                opacity={reached}
              >
                {a.toFixed(2)}
              </text>
            </g>
          );
        }),
      )}

      {/* layer captions */}
      {IN_LABELS.map((l, i) => (
        <text key={l} x={layerX(0) - 78} y={nodeY(0, i) + 8} textAnchor="middle"
          fontFamily={FONT.mono} fontSize={22} fill={PLAY.inkMuted}>{l}</text>
      ))}
      {OUT_LABELS.map((l, i) => (
        <text key={l} x={layerX(2) + 78} y={nodeY(2, i) + 8} textAnchor="middle"
          fontFamily={FONT.mono} fontSize={26} fill={PLAY.inkBody}>{l}</text>
      ))}
    </g>
  );
};

/**
 * A small on-stage annotation. Not a text card — it labels the artefact.
 *
 * Sits ABOVE `STAGE.bot`, because `STAGE.bot` is exactly where the caption band
 * begins. Anything drawn below it is hidden behind the captions, which looks
 * like a rendering bug and is really a layout one.
 */
const Note: React.FC<{
  x: number; y: number; children: React.ReactNode; color?: string; size?: number; o?: number;
}> = ({ x, y, children, color = PLAY.inkBody, size = 27, o = 1 }) => (
  <text x={x} y={y} textAnchor="middle" fill={color} fontFamily={FONT.mono}
    fontSize={size} opacity={clamp(o)} letterSpacing={1}>
    {children}
  </text>
);

// ── the director ──────────────────────────────────────────────────────
export const Scene: React.FC<{ beat: Beat; t: number; now: number }> = ({ beat, t }) => {
  const p = clamp(t / Math.max(0.001, beat.dur));
  const act = activations(DEFAULT_INPUT);

  // Each beat sets properties of the ONE artefact. Note that no branch returns
  // a different top-level graphic — they all return the same <Network/>.
  let flow = 1;
  let zoom = 0;
  let litEdge: { layer: number; to: number; from: number } | null = null;
  let note: React.ReactNode = null;

  switch (beat.id) {
    case "01a-one-neuron":
      // Open zoomed into a single neuron: the whole lesson is this, scaled up.
      zoom = 1 - easeOut(span(p, 0.72, 1));
      flow = easeOut(span(p, 0.1, 0.6)) * 0.5;
      litEdge = { layer: 0, to: 0, from: 1 };
      note = (
        <Note x={W / 2} y={STAGE.bot - 40} o={span(p, 0.15, 0.35)} color={PLAY.learn}>
          one neuron · weighted sum, then squash
        </Note>
      );
      break;

    case "02a-a-layer":
      // Pull back. Same object, more of it.
      flow = 0.5 + easeOut(span(p, 0.2, 0.8)) * 0.5;
      note = (
        <Note x={W / 2} y={STAGE.bot - 40} o={span(p, 0.3, 0.5)}>
          four neurons, each reading the same three inputs
        </Note>
      );
      break;

    case "02b-tune-a-weight":
      // Hold steady and mark the edge the popup is about to hand over.
      litEdge = { layer: 0, to: 2, from: 0 };
      note = (
        <Note x={W / 2} y={STAGE.bot - 40} color={PLAY.learn} o={span(p, 0.2, 0.4)}>
          this weight is yours to move
        </Note>
      );
      break;

    case "03a-forward-pass":
      // The wavefront. This beat is the reason `flow` exists.
      flow = easeOut(p);
      note = (
        <Note x={W / 2} y={STAGE.bot - 40} o={span(p, 0.05, 0.2)} color={PLAY.live}>
          input → hidden → output
        </Note>
      );
      break;

    case "03b-make-it-fire":
      note = (
        <Note x={W / 2} y={STAGE.bot - 40} color={PLAY.heat} o={span(p, 0.2, 0.4)}>
          A is winning. your turn to change that
        </Note>
      );
      break;

    case "04a-training":
      // Training reads as the edges rebalancing, not as a chart of loss.
      note = (
        <Note x={W / 2} y={STAGE.bot - 40} o={span(p, 0.2, 0.4)} color={PLAY.win}>
          training only ever changes these numbers
        </Note>
      );
      break;
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <rect width={W} height={H} fill={PLAY.void} />
      <Network act={act} flow={flow} zoom={zoom} litEdge={litEdge} />
      {note}
    </svg>
  );
};

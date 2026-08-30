/**
 * The film layer — pure visuals, a function of lesson time, no pointer events.
 *
 * ONE ARTEFACT. Pick the single object this lesson is about and make every
 * beat a STATE of that object — what is written into it, what is lit, who
 * reads it — never a fresh diagram per beat. That is the difference between a
 * lesson that feels like one continuous thing and a deck of slides.
 *
 * If the narration says a ball moves, draw a moving ball. Do not draw a card
 * that says "the ball moves".
 *
 * COLOUR RULE (PLAY track): cyan = what flows · violet = what the learner can
 * move · mint = solved · amber = a marker or score · red ONLY on an attempt
 * the viewer watched fail. A losing option that was never tried stays grey.
 *
 * This layer is rendered inside a 1920x1080 box that is scaled to fit, so
 * every coordinate here is in film pixels and never needs a media query.
 */

import { PLAY, FONT, clamp, span, easeOut, type Beat } from "@play/runtime";

const W = 1920;
const H = 1080;

/** Vertical band the artefact lives in — the rail and captions own the rest. */
export const STAGE = { top: 97, bot: 805 };

export const Scene: React.FC<{ beat: Beat; t: number; now: number }> = ({ beat, t }) => {
  /** 0 → 1 through THIS beat. Drive every animation from it, never from a
   *  frame counter: it stays correct through pause, seek and scrub. */
  const p = clamp(t / Math.max(0.001, beat.dur));

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <rect width={W} height={H} fill={PLAY.void} />

      {/* Replace everything below with the artefact this lesson is about. */}
      <g opacity={easeOut(span(p, 0, 0.25))}>
        <circle
          cx={W / 2}
          cy={(STAGE.top + STAGE.bot) / 2}
          r={90 + 40 * easeOut(span(p, 0.2, 0.9))}
          fill="none"
          stroke={PLAY.live}
          strokeWidth={3}
        />
        <text
          x={W / 2}
          y={STAGE.bot - 60}
          textAnchor="middle"
          fill={PLAY.inkMuted}
          fontFamily={FONT.mono}
          fontSize={26}
          letterSpacing={2}
        >
          {beat.id}
        </text>
      </g>
    </svg>
  );
};

/**
 * THE ARTEFACT: one 3-4-2 network, shared by the film layer and the popups.
 *
 * This file is the reason the example is worth reading. The scene does not draw
 * "a picture of a network" and the interactive does not simulate a second one —
 * both render the SAME model, so when a learner drags a weight in a popup and
 * the film later shows a forward pass, they are watching one object they have
 * already touched. Two copies of the maths would drift, and the lesson would
 * quietly become a diagram again.
 *
 * Everything here is a pure function. No React, no time, no randomness at call
 * time — a seeded generator means the network looks identical on every run and
 * on every machine, which is what makes a screenshot comparable to yesterday's.
 */

/** input · hidden · output */
export const LAYERS = [3, 4, 2] as const;

/** The band the artefact lives in — the chapter rail and captions own the rest. */
export const STAGE = { top: 97, bot: 805 };

/** Layer x positions, evenly spread with a wide margin so labels have room. */
export const layerX = (layer: number) => 420 + layer * 540;

/** Node y positions, each layer centred in the stage band. */
export const nodeY = (layer: number, i: number) => {
  const n = LAYERS[layer];
  const mid = (STAGE.top + STAGE.bot) / 2;
  const gap = 132;
  return mid + (i - (n - 1) / 2) * gap;
};

export const NODE_R = 34;

// ── the weights ───────────────────────────────────────────────────────
/** Seeded so the network is the same object every run. */
const rnd = (seed: number) => {
  let s = seed * 9301 + 49297;
  return () => (((s = (s * 9301 + 49297) % 233280) / 233280) * 2 - 1);
};

const matrix = (rows: number, cols: number, seed: number) => {
  const r = rnd(seed);
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => Math.round(r() * 100) / 100));
};

/** hidden ← input, then output ← hidden. */
export const W0 = matrix(LAYERS[1], LAYERS[0], 7);
export const W1 = matrix(LAYERS[2], LAYERS[1], 13);

// ── the maths ─────────────────────────────────────────────────────────
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

const layerPass = (inputs: number[], w: number[][]) =>
  w.map((row) => sigmoid(row.reduce((s, wi, i) => s + wi * inputs[i], 0)));

/** One forward pass. Returns every layer's activations, because the film needs
 *  the intermediate values to light the nodes, not just the answer. */
export const forward = (inputs: number[], w0 = W0, w1 = W1) => {
  const hidden = layerPass(inputs, w0);
  const out = layerPass(hidden, w1);
  return { inputs, hidden, out };
};

export const activations = (inputs: number[], w0 = W0, w1 = W1): number[][] => {
  const { hidden, out } = forward(inputs, w0, w1);
  return [inputs, hidden, out];
};

/** Which output neuron wins. The interactives derive success from this rather
 *  than from a click, so a learner cannot be told they solved something they
 *  did not. */
export const winner = (out: number[]) => out.indexOf(Math.max(...out));

export const OUT_LABELS = ["A", "B"];
export const IN_LABELS = ["x₁", "x₂", "x₃"];

/** A neutral starting input, used by the film and as the popups' initial state. */
export const DEFAULT_INPUT = [0.6, -0.2, 0.9];

/** Edge opacity should track how much signal an edge actually carries, so a
 *  near-zero weight looks near-dead instead of merely thin. */
export const edgeWeight = (w: number) => Math.min(1, Math.abs(w) / 1.2);

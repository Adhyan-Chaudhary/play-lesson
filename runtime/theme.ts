/** PLAY track tokens — see play/PLAY-GUIDE.md §2. Dark by commitment. */
export const PLAY = {
  void: "#0A0E14",
  surface: "#121822",
  surfaceHi: "#1B2430",
  hairline: "rgba(255,255,255,0.08)",
  hairlineHi: "rgba(255,255,255,0.16)",
  scrim: "rgba(10,14,20,0.72)",
  ink: "#E8EDF4",
  inkBody: "#A3B0C2",
  inkMuted: "#6B7A8F",
  // cyan flows · violet is yours to move · mint solved · amber score · red failed
  live: "#4CC9F0",
  learn: "#B892FF",
  win: "#47E6A0",
  heat: "#FFB84D",
  fail: "#FF6B6B",
} as const;

export const FONT = {
  ui: '"Inter", system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, Menlo, monospace',
} as const;

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const span = (v: number, a: number, b: number) => clamp((v - a) / (b - a));
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

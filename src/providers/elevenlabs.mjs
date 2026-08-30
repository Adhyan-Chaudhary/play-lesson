/**
 * ElevenLabs — the finishing provider. Real voice, and REAL caption timings:
 * the with-timestamps endpoint returns per-character alignment, so word spans
 * are measured rather than inferred.
 *
 * It costs credits, so it never runs by accident. `voice` refuses to use this
 * provider unless the caller passes --yes, and the CLI says exactly how many
 * characters the run will spend before asking. Draft on edge; spend here once.
 *
 * Needs ELEVENLABS_API_KEY in the environment.
 */

import { writeFile } from "node:fs/promises";
import { alignmentToWords } from "./srt.mjs";

export const name = "elevenlabs";
export const needsConsent = true;

const API = "https://api.elevenlabs.io/v1/text-to-speech";

export const check = async () =>
  process.env.ELEVENLABS_API_KEY
    ? null
    : "ELEVENLABS_API_KEY is not set. Export it, or draft with --provider edge.";

export const synth = async ({ text, mp3Path, voice, rate, modelId }) => {
  // The API has no rate parameter; pacing is a property of the voice settings
  // and the text. Flagged rather than ignored, so a config that sets a rate
  // and gets a different result has an explanation.
  if (rate && rate !== "+0%" && rate !== "0%") {
    console.log(`  note: voice.rate ${rate} is ignored by elevenlabs (edge-only setting)`);
  }

  const res = await fetch(`${API}/${voice}/with-timestamps`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability: 0.4, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `elevenlabs ${res.status} ${res.statusText}` +
      (body ? `\n  ${body.slice(0, 400)}` : "") +
      (res.status === 401 ? "\n  (check ELEVENLABS_API_KEY)" : ""),
    );
  }

  const json = await res.json();
  await writeFile(mp3Path, Buffer.from(json.audio_base64, "base64"));

  // normalized_alignment matches the spoken text after the API's own
  // normalisation ("1990" → "nineteen ninety"), which is what was actually
  // said; fall back to the raw alignment if it is absent.
  const words = alignmentToWords(json.normalized_alignment ?? json.alignment);
  return { words, estimated: false };
};

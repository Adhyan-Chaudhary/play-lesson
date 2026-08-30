import * as edge from "./edge.mjs";
import * as elevenlabs from "./elevenlabs.mjs";

export const PROVIDERS = { edge, elevenlabs };

export const getProvider = (id) => {
  const p = PROVIDERS[id];
  if (!p) {
    throw new Error(
      `unknown voice provider "${id}" — expected one of: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  return p;
};

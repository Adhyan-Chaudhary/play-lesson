/**
 * What a lesson imports from the package: `import { PLAY, FONT } from "@play/runtime"`.
 *
 * Deliberately small. A lesson owns its visuals; the package owns the shell,
 * the clock and the tokens. Anything that has to be shared BETWEEN lessons
 * belongs here — anything specific to one lesson's subject does not.
 */

export { PLAY, FONT, clamp, lerp, span, easeOut } from "./theme";
export type { Beat, Interactive } from "@play/manifest";

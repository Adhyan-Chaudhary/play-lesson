/**
 * Command router.
 *
 * Hand-rolled argument parsing rather than a dependency: the surface is a
 * dozen flags, and a CLI that installs globally is one people will run on
 * machines where `npm i` has to be fast and boring.
 */

import { createRequire } from "node:module";
import { bold, cyan, dim, head, info } from "./log.mjs";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

/** Flags that take no value, so `--force build` does not eat "build". */
const BOOL = new Set(["dev", "force", "yes", "open", "help", "version"]);
/** Flags that are comma-separated lists. */
const LIST = new Set(["only"]);

export const parse = (argv) => {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("-")) {
      out._.push(a);
      continue;
    }
    const [rawKey, inlineVal] = a.replace(/^--?/, "").split("=");
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (BOOL.has(key)) {
      out[key] = true;
    } else {
      const val = inlineVal ?? argv[++i];
      out[key] = LIST.has(key) ? String(val ?? "").split(",").filter(Boolean) : val;
    }
  }
  return out;
};

const COMMANDS = {
  init: { desc: "scaffold a new lesson folder", load: () => import("./commands/init.mjs") },
  voice: { desc: "transcript.txt → audio/ + captions/", load: () => import("./commands/voice.mjs") },
  timings: { desc: "measure the audio → timings.json", load: () => import("./commands/timings.mjs") },
  manifest: { desc: "config + timings → .play/manifest.ts", load: () => import("./commands/manifest.mjs") },
  build: { desc: "bundle the lesson into one folder", load: () => import("./commands/build.mjs") },
  serve: { desc: "serve the build over http", load: () => import("./commands/serve.mjs") },
  shot: { desc: "screenshot every beat headlessly", load: () => import("./commands/shot.mjs") },
  doctor: { desc: "what is installed, what is missing", load: () => import("./commands/doctor.mjs") },
};

const HELP = `
${bold("play-lesson")} ${dim(version)}   narrated, interactive lessons

  ${bold("play-lesson init <slug>")}      scaffold a lesson folder
  ${bold("play-lesson voice")}            record narration + captions   ${dim("--provider edge|elevenlabs --yes --force --only a,b")}
  ${bold("play-lesson make")}             timings → manifest → build    ${dim("--mode embed|share --dev")}
  ${bold("play-lesson serve")}            look at it                    ${dim("--port 8902")}
  ${bold("play-lesson shot")}             a PNG per beat                ${dim("--at 0.6 --open --only a,b")}
  ${bold("play-lesson doctor")}           check this machine

${dim("individual steps: timings · manifest · build")}

${bold("The loop")}
  ${cyan("1.")} edit lesson.config.json  — chapters, beats, which beats go hands-on
  ${cyan("2.")} write transcript.txt     — one "## <beat-id>" section per beat
  ${cyan("3.")} play-lesson voice        — free by default; elevenlabs needs --yes
  ${cyan("4.")} write scenes.tsx and interactives.tsx
  ${cyan("5.")} play-lesson make && play-lesson serve

${bold("Reviewing without sitting through it")}
  ?beat=N          jump to a beat
  ?beat=N&p=0.6    freeze 60% into it, no audio
  ?beat=N&open=1   open that beat's interactive

${dim("PLAY_CHROME  path to Chrome for `shot`")}
${dim("ELEVENLABS_API_KEY  required only by --provider elevenlabs")}
`;

/** The three steps that always run together after any content edit. */
const make = async (argv) => {
  await (await import("./commands/timings.mjs")).run(argv);
  await (await import("./commands/manifest.mjs")).run(argv);
  const res = await (await import("./commands/build.mjs")).run(argv);
  console.log("");
  info(`serve it:  play-lesson serve`);
  return res;
};

export const main = async (rawArgv) => {
  const argv = parse(rawArgv);
  const cmd = argv._.shift();

  if (argv.version) return console.log(version);
  if (!cmd || argv.help || cmd === "help") return console.log(HELP);

  if (cmd === "make") return make(argv);

  const entry = COMMANDS[cmd];
  if (!entry) {
    head(`unknown command "${cmd}"`);
    const known = [...Object.keys(COMMANDS), "make"].join(", ");
    throw new Error(`expected one of: ${known}\n  Run \`play-lesson help\`.`);
  }

  const mod = await entry.load();
  return mod.run(argv);
};

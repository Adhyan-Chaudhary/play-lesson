/**
 * Bundle a lesson into a self-contained folder: index.html + audio/ + captions/.
 *
 * WHY THE JS IS INLINED and the audio is not: the narration is 10-15 MB across
 * ~20 clips and has to stream as files, but the bundle is ~200 KB and inlining
 * it removes a request, a CSP question and a relative-path bug class. There is
 * an upper limit on that trick — see the size guard below.
 *
 * TWO SHAPES:
 *   --mode embed   (default) captions fetched as files. For a web host.
 *   --mode share   captions inlined on window.__PLAY_CAPTIONS. For a zip that
 *                  someone unzips and double-clicks, where file:// blocks
 *                  fetch. Audio and images load fine from file://; only the
 *                  captions needed inlining.
 */

import * as esbuild from "esbuild";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, paths } from "../config.mjs";
import { head, info, ok, warn, kb, mb } from "../log.mjs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Escaping "</script" alone is NOT enough for an inline bundle. React's
 * minified build contains "<!--" (Suspense markers), which moves the HTML
 * tokenizer into script-data-escaped state, where a later "</script>" may not
 * close the element and the page dies silently. Neutralise both.
 * Do NOT also escape "<script" — \s in a regex is the whitespace class.
 */
const safeForInlineScript = (js) =>
  js.replace(/<\/script/gi, "<\/script").replace(/<!--/g, "<\!--");

const dirSize = async (dir) => {
  let total = 0;
  for (const f of await readdir(dir).catch(() => [])) {
    total += (await stat(join(dir, f))).size;
  }
  return total;
};

const html = ({ title, capScript, js }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"))}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; background: #0A0E14; }
  body { -webkit-tap-highlight-color: transparent; }
  #root { width: 100%; }
  button { font-family: inherit; -webkit-appearance: none; appearance: none; }
  button:hover:not(:disabled) { filter: brightness(1.16); }
  button:focus-visible { outline: 2px solid #FFB84D; outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
</head>
<body>
<div id="root"></div>
${capScript}<script>
  /* An embedded page has no console the author can reach: it runs in a
     cross-origin iframe where console reads and contentDocument both fail.
     A crash would otherwise show as a blank white frame with no clue.
     Registered BEFORE the bundle so it catches the bundle's own failure. */
  window.addEventListener("error", function (e) {
    var r = document.getElementById("root");
    if (!r || r.childElementCount) return;
    r.innerHTML = '<pre style="margin:0;padding:28px;min-height:50vh;background:#0A0E14;' +
      'color:#FF6B6B;font:14px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap">' +
      String(e.message) + "\n\n" + String((e.error && e.error.stack) || "") + "</pre>";
  });
</script>
<script>${js}</script>
</body>
</html>
`;

export const run = async (argv) => {
  const cfg = await loadConfig();
  const p = paths(cfg);
  const share = argv.mode === "share";
  const out = argv.out ? resolve(process.cwd(), argv.out) : join(cfg.out, cfg.slug);

  head(`build · ${cfg.slug}${share ? " (share)" : ""}`);

  try {
    await stat(p.manifest);
  } catch {
    throw new Error(`no .play/manifest.ts — run \`play-lesson manifest\` first (or use \`play-lesson make\`)`);
  }

  await mkdir(out, { recursive: true });

  const result = await esbuild.build({
    entryPoints: [join(PKG, "runtime", "main.tsx")],
    bundle: true,
    minify: !argv.dev,
    sourcemap: argv.dev ? "inline" : false,
    format: "iife",
    target: "es2019",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": argv.dev ? '"development"' : '"production"' },
    // The lesson's own files are pulled in by name. This is what lets a lesson
    // live in any directory: it supplies content, the package supplies the shell.
    alias: {
      "@play/manifest": p.manifest,
      "@play/scenes": p.scenes,
      "@play/interactives": p.interactives,
      "@play/theme": join(PKG, "runtime", "theme.ts"),
      "@play/runtime": join(PKG, "runtime", "index.ts"),
    },
    // React is a dependency of THIS package, not of the lesson. nodePaths lets
    // the lesson's own scenes.tsx resolve react (and react/jsx-runtime) from
    // here, so a lesson folder needs no node_modules at all.
    nodePaths: [join(PKG, "node_modules")],
    absWorkingDir: cfg.root,
    write: false,
    logLevel: argv.dev ? "info" : "warning",
  });

  const js = safeForInlineScript(result.outputFiles[0].text);

  let capScript = "";
  if (share) {
    const files = (await readdir(p.captions).catch(() => [])).filter((f) => f.endsWith(".json"));
    const caps = {};
    for (const f of files) caps[f.replace(/\.json$/, "")] = JSON.parse(await readFile(join(p.captions, f), "utf8"));
    capScript = `<script>window.__PLAY_CAPTIONS=${JSON.stringify(caps).replace(/<\//g, "<\/")}<\/script>\n`;
  }

  const page = html({ title: cfg.title, capScript, js });
  await writeFile(join(out, "index.html"), page, "utf8");

  // `force` so a rebuild overwrites the previous output, `dereference` so a
  // symlinked audio/ (handy when several builds share one recording) copies its
  // contents rather than a dangling link.
  const copyOpts = { recursive: true, force: true, dereference: true };

  for (const dir of ["audio", "captions"]) {
    const from = join(cfg.root, dir);
    if (!(await stat(from).then(() => true).catch(() => false))) {
      warn(`no ${dir}/ — the page will load without it`);
      continue;
    }
    await rm(join(out, dir), { recursive: true, force: true });
    await cp(from, join(out, dir), copyOpts);
  }

  for (const asset of cfg.assets) {
    const from = join(cfg.root, asset);
    if (!(await stat(from).then(() => true).catch(() => false))) {
      throw new Error(`lesson.config.json lists asset "${asset}", but ${from} does not exist`);
    }
    await cp(from, join(out, asset), copyOpts);
  }

  const pageSize = Buffer.byteLength(page);
  ok(`${out}`);
  info(`index.html  ${kb(pageSize)}`);
  info(`audio/      ${mb(await dirSize(join(out, "audio")))}`);
  info(`captions/   ${kb(await dirSize(join(out, "captions")))}`);

  /**
   * A page this large has been observed to be silently refused — no error, no
   * console, a blank frame. The cause was an oversized data: URI, so the guard
   * is on the HTML, not the bundle. If you trip it, the fix is almost always
   * an image inlined at full resolution instead of the size it displays at.
   */
  if (pageSize > 600 * 1024) {
    warn(`index.html is ${kb(pageSize)} — large inline pages can be silently refused by some hosts.`);
    warn(`Check for a full-resolution image inlined into a scene; downscale it to its displayed size.`);
  }

  return { out, pageSize };
};

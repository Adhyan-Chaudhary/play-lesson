/**
 * A static server for the built lesson.
 *
 * Exists because the page cannot be reviewed from file://: fetch is blocked
 * there, so captions vanish in the default (non-share) build and the failure
 * looks like a captioning bug rather than a protocol one. Serving over HTTP
 * removes that whole confusion.
 */

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { loadConfig } from "../config.mjs";
import { head, info, ok } from "../log.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

export const serveDir = (dir, port, host = "127.0.0.1") =>
  new Promise((resolvePromise, reject) => {
    const server = createServer(async (req, res) => {
      // Strip the query (?beat=3&p=0.6 is read by the page, not the server)
      // and refuse anything that climbs out of the served directory.
      const rel = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^[\/\\]+/, "");
      const file = join(dir, rel === "" ? "index.html" : rel);
      if (!file.startsWith(dir)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      try {
        const s = await stat(file);
        const target = s.isDirectory() ? join(file, "index.html") : file;
        res.writeHead(200, {
          "content-type": MIME[extname(target)] ?? "application/octet-stream",
          // Ranges matter: without them Chrome cannot seek inside an mp3.
          "accept-ranges": "bytes",
          "cache-control": "no-store",
        });
        createReadStream(target).pipe(res);
      } catch {
        res.writeHead(404).end("not found");
      }
    });
    server.on("error", reject);
    server.listen(port, host, () => resolvePromise(server));
  });

export const run = async (argv) => {
  const cfg = await loadConfig();
  const dir = argv.dir ? resolve(process.cwd(), argv.dir) : join(cfg.out, cfg.slug);
  const port = Number(argv.port ?? 8902);

  try {
    await stat(join(dir, "index.html"));
  } catch {
    throw new Error(`nothing built at ${dir} — run \`play-lesson make\` first`);
  }

  await serveDir(dir, port);
  head(`serve · ${cfg.slug}`);
  ok(`http://localhost:${port}/`);
  info(`?beat=3           jump to a beat`);
  info(`?beat=3&p=0.6     freeze 60% into it, no audio — for screenshots`);
  info(`?beat=3&open=1    open that beat's interactive immediately`);
  info(`Ctrl-C to stop.`);
  return new Promise(() => {}); // hold the process open
};

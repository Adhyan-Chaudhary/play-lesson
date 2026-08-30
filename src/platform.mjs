/**
 * Everything that differs between macOS, Linux/WSL and Windows lives here, so
 * no command has to know which one it is running on.
 *
 * The provider scripts this replaces were bash, and carried a hardcoded macOS
 * python path plus `afinfo` for durations — which is why they only ever ran on
 * one machine. Spawning the binaries directly from Node removes the shell from
 * the picture entirely: no bash on Windows, no quoting differences, and one
 * duration probe (ffprobe) that exists on all three.
 */

import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { platform } from "node:os";

export const OS = platform(); // "darwin" | "linux" | "win32"

const exists = async (p) => {
  try {
    await access(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Run a binary and capture it. Rejects with the tail of stderr, because the
 * useful line in a ffprobe or edge-tts failure is always the last one and the
 * rest is banner noise.
 */
export const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) =>
      reject(new Error(`could not run \`${cmd}\` — ${e.code === "ENOENT" ? "not installed or not on PATH" : e.message}`)),
    );
    p.on("close", (code) => {
      if (code === 0) return resolve({ out, err });
      const tail = err.trim().split("\n").slice(-3).join("\n  ");
      reject(new Error(`\`${cmd}\` exited ${code}\n  ${tail}`));
    });
  });

/** Is a command on PATH? Uses spawn rather than `which`/`where`, which differ. */
export const has = async (cmd, probeArgs = ["-version"]) => {
  try {
    await run(cmd, probeArgs);
    return true;
  } catch (e) {
    return !/not installed or not on PATH/.test(e.message);
  }
};

/**
 * Clip duration in seconds. ffprobe rather than afinfo (macOS-only) or
 * mediainfo (rarely installed) — it ships with ffmpeg, which this workflow
 * already needs, and prints a bare float with these flags.
 */
export const duration = async (file) => {
  const { out } = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const n = Number(out.trim());
  if (!Number.isFinite(n)) throw new Error(`ffprobe gave no duration for ${file}`);
  return Math.round(n * 1000) / 1000;
};

/**
 * Where Chrome is. Only used by `shot`, and only worth guessing because the
 * alternative — asking every user to set an env var before they can screenshot
 * anything — is the kind of friction that stops people verifying their work.
 * PLAY_CHROME always wins if set.
 */
const CHROME = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
  ],
  win32: [
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  ],
};

export const findChrome = async () => {
  if (process.env.PLAY_CHROME) return process.env.PLAY_CHROME;
  for (const p of CHROME[OS] ?? []) if (await exists(p)) return p;
  return null;
};

/**
 * WSL can reach a Windows Chrome through /mnt/c, but that Chrome cannot open a
 * Linux path or resolve `localhost` back into the distro — so `shot` serves
 * over HTTP and hands it a URL, and screenshots must land on a path Windows
 * can write. Detected here so the command can say so instead of failing oddly.
 */
export const isWslWithWindowsChrome = (chromePath) =>
  OS === "linux" && !!chromePath && chromePath.startsWith("/mnt/");

# play-lesson

Build narrated, interactive lessons. A lesson is a folder of content; this
package is the player, the clock and the build.

```
play-lesson init positional-embeddings
cd positional-embeddings
# edit lesson.config.json, write transcript.txt
play-lesson voice          # narration + captions, free by default
play-lesson make           # timings -> manifest -> bundle
play-lesson serve          # http://localhost:8902
```

The output is one self-contained folder — `index.html`, `audio/`, `captions/` —
that you can drop on any static host or into a `public/embeds/` directory.

---

## Install

Works the same on **macOS**, **Linux** and **WSL**. There is no shell script
anywhere in the toolchain: `ffprobe`, `edge-tts` and Chrome are spawned directly
from Node, so nothing depends on bash and the same commands work everywhere.

### 1. Prerequisites

| | required | why |
|---|---|---|
| Node | **18.17+** | the CLI and the bundler |
| ffmpeg | **required** | `ffprobe` measures clip durations |
| edge-tts | optional | the free default voice |
| Chrome | optional | only for `play-lesson shot` |

<details>
<summary><b>macOS</b></summary>

```bash
brew install node ffmpeg
pipx install edge-tts        # or: pip3 install --user edge-tts
```

Chrome, if you want screenshots, is the normal app download — it is found
automatically at `/Applications/Google Chrome.app`.
</details>

<details>
<summary><b>WSL (Ubuntu) / Linux</b></summary>

```bash
sudo apt update && sudo apt install -y ffmpeg
pipx install edge-tts        # or: pip3 install --user edge-tts
```

Node 18.17+ — use [nvm](https://github.com/nvm-sh/nvm) if your distro ships
something older.

**Screenshots from WSL:** you do not need a Linux Chrome. `shot` detects a
Windows Chrome at `/mnt/c/Program Files/Google/Chrome/Application/chrome.exe`,
and works around the two things that break in that setup — a Windows browser
cannot resolve `localhost` back into the distro, and cannot write a screenshot
to a Linux path. It serves on the distro's LAN address and translates the output
path with `wslpath` automatically. You will see it say so:

```
Windows Chrome driven from WSL — serving on 172.27.184.58:8917 instead of localhost
```

Installing a Linux Chrome instead also works and skips all of that.
</details>

### 2. Install the CLI

```bash
git clone git@github.com:Adhyan-Chaudhary/play-lesson.git
npm i -g ./play-lesson
```

Or straight from GitHub, no clone:

```bash
npm i -g git+ssh://git@github.com/Adhyan-Chaudhary/play-lesson.git
```

Or from a tarball, if the machine has no GitHub access:

```bash
npm pack                     # in a clone — writes play-lesson-0.1.0.tgz
npm i -g ./play-lesson-0.1.0.tgz
```

### 3. If `npm i -g` asks for sudo

npm's default prefix is often a root-owned directory. Do **not** use sudo — give
npm a prefix in your home directory instead. This is a one-time fix and applies
equally on macOS and WSL:

```bash
npm config set prefix ~/.npm-global
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc   # or ~/.zshrc on macOS
exec $SHELL
```

Then re-run the install.

### 4. Check the machine

```bash
play-lesson doctor
```

Lists what is installed, what is missing, and what each missing thing blocks. Run
this first on any new machine — it is faster than reading an error later.

---

## The workflow

```
play-lesson init <slug>       scaffold a lesson folder
# 1. edit lesson.config.json  — chapters, beats, which beats go hands-on
# 2. write transcript.txt     — one "## <beat-id>" section per beat
play-lesson voice             # narration + captions
# 3. write scenes.tsx and interactives.tsx
play-lesson make              # timings -> manifest -> bundle
play-lesson shot --open       # a PNG per beat, to check without watching
play-lesson serve             # look at it
```

`make` is what you re-run after any edit. `voice` skips clips that already
exist, so re-running it after fixing one beat does not re-record the rest —
pass `--force` when you do want that.

### What a lesson folder holds

| file | who writes it |
|---|---|
| `lesson.config.json` | you — chapters, beats, which beats open an interactive |
| `transcript.txt` | you — one `## <beat-id>` section per beat |
| `scenes.tsx` | you — the film layer |
| `interactives.tsx` | you — the popups |
| `audio/`, `captions/` | `play-lesson voice` |
| `timings.json` | `play-lesson timings` — measured, never typed |
| `.play/manifest.ts` | `play-lesson manifest` — generated, never edited |

Nothing measurable is ever hand-written. `start` is a running sum of measured
durations, so the beats butt-joint into one continuous track and the clock
cannot drift from the voice. Interactive time is deliberately not in the
timeline: a popup pauses the clock while it is open, so `start` stays a pure
function of the narration no matter how long a learner spends playing.

A lesson folder needs **no `node_modules`**. React and the player come from this
package; the build wires them together with aliases (`@play/manifest`,
`@play/scenes`, `@play/interactives`, `@play/theme`, `@play/runtime`). That is
what lets a lesson live in any directory on any machine.

---

## Voices

**edge-tts** is the default: free, no key, no account.

Its captions are *estimated*. edge-tts emits one subtitle cue per sentence, so
word times are produced by splitting each cue across its words weighted by
letter count — exact at the cue boundaries, up to about 150 ms off mid-sentence.
That is invisible in a caption band, which shows a whole line at a time. Do not
build word-level highlighting on it.

**ElevenLabs** returns measured per-character alignment, so word spans are real.
It costs credits, so it never runs by accident:

```bash
export ELEVENLABS_API_KEY=...
play-lesson voice --provider elevenlabs --yes
```

Without `--yes` it refuses and prints the exact character count the run would
bill, so the decision is made on a number. Draft on edge; spend once at the end.

---

## Reviewing without watching

A 13-minute lesson is not reviewable by playing it. The player reads its own
URL, so any state can be captured directly:

```
?beat=7            jump to a beat
?beat=7&p=0.6      freeze 60% into it, no audio
?beat=7&open=1     open that beat's interactive
```

```bash
play-lesson shot --open          # one PNG per beat, into stills/
play-lesson shot --only 07a-the-clocks --at 0.3
```

A blank white capture means the page **crashed**, not that styling is off. The
built page registers an error handler before its own bundle and prints the stack
into the page, so the PNG shows you the error instead of a white rectangle.

---

## Build shapes

```bash
play-lesson build                 # --mode embed (default)
play-lesson build --mode share
```

**embed** serves captions as files — for a web host.
**share** inlines them on `window.__PLAY_CAPTIONS` — for a zip that someone
unzips and double-clicks, where `file://` blocks `fetch`. Audio and images load
fine from `file://`; only the captions needed inlining.

---

## The agent

`agent/play-lesson.md` is a Claude Code subagent that drives all of this —
scaffolding, drafting, authoring the scenes and interactives, and the
build/screenshot loop.

```bash
mkdir -p ~/.claude/agents
cp agent/play-lesson.md ~/.claude/agents/
```

It stops for approval after drafting the transcript, and never uses a paid voice
provider unless asked.

---

## Commands

| | |
|---|---|
| `init <slug>` | scaffold a lesson folder |
| `voice` | transcript → audio + captions · `--provider --yes --force --only` |
| `timings` | measure the audio → `timings.json` |
| `manifest` | config + timings → `.play/manifest.ts` |
| `build` | bundle · `--mode embed\|share --dev --out` |
| `make` | timings → manifest → build |
| `serve` | serve the build · `--port` |
| `shot` | a PNG per beat · `--at --open --only --size` |
| `doctor` | what is installed here |

**Environment**

| | |
|---|---|
| `PLAY_CHROME` | path to Chrome, if `shot` cannot find it |
| `ELEVENLABS_API_KEY` | only for `--provider elevenlabs` |
| `PLAY_DEBUG=1` | print stack traces on error |

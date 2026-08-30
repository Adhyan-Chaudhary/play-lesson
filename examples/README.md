# Examples

Two worked lessons on unrelated subjects, built with the same technique. Read
both before writing a `scenes.tsx` of your own — the rules in the agent file
tell you *what* to aim for, and these show you what hitting it looks like.

| | `neural-network` | `positional-embeddings` |
|---|---|---|
| the artefact | a 3-4-2 network | the residual stream |
| beats | 6 | 20 |
| interactives | 2 | 6 |
| runnable? | **yes** — has a transcript, run `voice` then `make` | code only |
| read it for | the pattern, at a size you can hold in your head | what the pattern survives at scale |

## `neural-network` — start here

Six beats, two interactives, and a `transcript.txt`, so you can build and watch
it in about a minute:

```bash
cp -r examples/neural-network my-copy && cd my-copy
play-lesson voice && play-lesson make && play-lesson serve
```

Four things in it are worth stealing directly:

**One artefact, held across every beat.** Look at the `switch` in `scenes.tsx`:
no branch returns a different top-level graphic. They all return the same
`<Network/>` with different props. Zooming into a neuron is `zoom`, a forward
pass is `flow` — properties of one object, not six pictures. The moment you
write a second top-level graphic you have started making slides.

**The film and the popups share one model.** Both import `net.ts`. A weight the
learner drags in a popup is the same weight the film draws. Simulate the subject
twice and the two copies drift, and the lesson quietly becomes a diagram of
itself.

**Success derived from state.** `MakeItFire` calls `winner(out) === 1` on a real
forward pass. It does not check slider positions, so an unexpected route to the
answer still counts — the difference between exploring and guessing a password.

**The `tried` flag.** Red is only legal on an attempt the learner *watched fail*.
Without that flag the popup paints red the instant it opens and scolds someone
for not having started. This is the rule most easily broken by accident; the
comment in the file explains it at the point of use.

## `positional-embeddings` — the same pattern, at scale

Twenty beats and six genuinely different interactives — drag a one-hot down a
column, reorder words, sweep a position across eight clock dials, watch a cosine
as you add dimensions. This is the proof the approach does not fall apart once a
lesson gets long.

It ships as **code only**: `scenes.tsx`, `interactives.tsx`, `stream.tsx` and
the config. No audio, no transcript — the narration is the author's teaching
content, and the reusable part is entirely in these files. It will not build as
it stands; read it, do not run it.

Note `stream.tsx`. Once an artefact needs real maths and layout, it earns its
own module, exactly as `net.ts` does in the smaller example. `scenes.tsx` should
stay a director — deciding what is lit and when — not a geometry library.

The `Hero` in its `scenes.tsx` has placeholder name and role text where the real
lesson has the author's. Worth reading anyway: it shows an opening title card
drawn *over* the artefact while the artefact is already forming behind it, then
dissolved — so the lesson opens on a person and still contains no cut.

## What not to copy from elsewhere

If you have seen this project's video-track scene library, do **not** pattern
off it here. Those are Remotion components: `useCurrentFrame()`, `interpolate()`,
a light palette, `SlideRoot` padding. A PLAY scene is the inverse — driven by
`t / beat.dur`, dark, full-bleed, and it imports nothing from `remotion`. The
two look similar in a screenshot and share almost no code.

| | video-track scene | PLAY scene |
|---|---|---|
| clock | `useCurrentFrame()` | `p = t / beat.dur` |
| palette | light | dark (`@play/theme`) |
| chrome | `SlideRoot`, `Eyebrow` | full-bleed, no chrome |
| interaction | none | popups, pointer in the UI layer |

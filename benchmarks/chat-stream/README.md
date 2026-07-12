# chat-stream benchmark

The modern workload: a ChatGPT/Claude-style chat interface — conversation
tabs, a keyed message list of role bubbles with mixed text/code segments, a
CONTROLLED composer — streaming **predefined token sequences** into the UI.
Seven frameworks implement the same DOM contract and state model; the harness
drains the stream deterministically and verifies the DOM after every sample.

## Determinism

- The corpus (`src/data.js`, identical file in every app) derives from one
  fixed mulberry32 seed at module load: every column streams byte-identical
  conversations in byte-identical chunks. No fixture JSON, no network, no
  storage.
- The measured path contains **no timers**: token arrival is driven by the
  harness through `window.__pump(k)` (append k tokens, commit, return the
  remaining count) in fixed-size batches — wall time to fully-rendered is pure
  render cost. A paced 60fps mode would measure the pacer.

## App API (the only bench hooks; all other interaction is dispatched DOM events)

- `window.__pump(k)` — token arrival is a network event, not user input.
- `window.__reset()` — pristine corpus restore between samples.
- vue-vapor additionally exposes `window.__benchFlush` (no public sync flush).

## State model (identical across columns)

Streaming replaces the streaming message immutably with an advanced `done`
counter per pump; segment text derives via the shared `segText(seg, done)`
(settled segments cache their joined text). Frameworks differ only in their
idiomatic reactivity around that model. Ripple's deriveds are functions called
in template expressions, Solid and Svelte update fine-grained bindings, and the
React and Preact handlers use public `flushSync` to bound each timed commit.

Known variance: solid's `switchConv` is bimodal PER BROWSER SESSION (~3.6ms
or ~6ms median, stable within a session) — its recorded baseline is pinned at
the slow mode so the one-sided compare rule passes both modes while still
catching a real regression above it.

## Columns

| app           | port |
| ------------- | ---- |
| `octane-tsrx` | 5250 |
| `react`       | 5251 |
| `solid`       | 5252 |
| `ripple`      | 5253 |
| `vue-vapor`   | 5254 |
| `preact`      | 5262 |
| `svelte`      | 5273 |

## Ops

Each op does enough work that every framework's median clears ~1ms (below
that, the 0.1ms timer granularity dominates and cross-run compares are noise).
Back-to-back sends are natural chat semantics — the reply cursor resets per
sample, so scaling is more conversation, not artificial repetition.

- `streamFine` — four scripted replies drained in 8-token batches (streaming
  chunk cadence): the sustained text-append + re-render hot path.
- `streamCoarse` — the same four replies in 64-token batches: fewer, bigger
  commits.
- `appendHistory` — two sends streamed into a 200-message history: do
  untouched keyed siblings stay untouched while the tail re-renders per pump?
- `switchConv` — five conversation-tab round trips (10 ↔ 200 messages):
  keyed teardown/rebuild.
- `type160` — 160 keystrokes through the CONTROLLED composer: per-keystroke
  state round-trip (the value prop reasserts from state).
- `comments_conv` — comment-node DOM weight at steady state (marker tripwire).

The `bundle-size` suite builds these apps too (`chat_*` ops) and the octane
source is in the `codegen-size` corpus. React's column runs its dev-mode
transform under the vite dev server (same caveat as every suite).

Native **Preact** (`:5262`) and runes-mode **Svelte 5** (`:5273`) fixtures use
the same deterministic corpus and window contract. Their state is immutable at
the conversation/message boundary and timed commits finish before returning.

## Run

```bash
node benchmarks/bench.mjs chat-stream       # via the suite runner (starts servers)
node benchmarks/bench.mjs --quick chat-stream
```

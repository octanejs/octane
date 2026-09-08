# chat-stream benchmark

The modern workload: a streaming chat interface — conversation
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
React handlers use public `flushSync`; Preact uses its native microtask scheduler
and the harness awaits each queued commit inside the timed window.

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

The `bundle-size` suite builds these apps too (`chat_*` ops), and the Octane
source is in the `codegen-size` corpus. The suite runner builds every framework
in production mode before starting its preview server; React's production build
also enables React Compiler.

Native **Preact** (`:5262`) and runes-mode **Svelte 5** (`:5273`) fixtures use
the same deterministic corpus and window contract. Their state is immutable at
the conversation/message boundary and timed commits finish before returning.

## Run

```bash
node benchmarks/bench.mjs chat-stream       # via the suite runner (starts servers)
node benchmarks/bench.mjs --quick chat-stream
```

The separate, untimed production-work gate uses Chromium precise coverage to
check that one token update in a 200-message history rerenders only the changed
message. It also verifies unchanged message identity and content, the updated
reply, and an unrelated controlled-composer update:

```bash
CHAT_STREAM_WORK=1 pnpm --filter octane-tsrx-chat-stream build
pnpm --filter octane-tsrx-chat-stream preview
pnpm --dir benchmarks/chat-stream bench:work
```

`TARGET_URL` overrides the preview address, and `WORK_JSON` saves the measured
counts. The work build is deliberately unminified; the normal benchmark keeps
its minified production bundle.

## Runtime-descriptor streaming sidecar

The compiled `.tsrx` fixture above does not exercise the generic host-tree
renderer used by Markdown libraries. The sidecar projects the same eight
`SCRIPTED_REPLIES` into one growing, multi-section document with headings,
paragraphs, and code blocks. Each arrival creates fresh `createElement`
descriptors, as a Markdown-to-JSX projection does. It deliberately excludes
Markdown parsing, syntax highlighting, network pacing, and layout/paint: its
metric is synchronous elapsed rendering and descriptor-projection time for the
complete token stream in a production build.

```bash
pnpm --dir benchmarks/chat-stream bench:descriptors
node benchmarks/chat-stream/descriptor-stream.mjs 16
node benchmarks/chat-stream/descriptor-stream.mjs --build-only
BENCH_JSON=/tmp/descriptor-stream.json node benchmarks/chat-stream/descriptor-stream.mjs 16
```

The runner builds a temporary production bundle, starts a loopback-only server
on an available port, launches Chromium, and cleans both up. No separately
running application or dependency installation is needed. Cases are:

- `hosts_fine`: raw host descriptors in 8-token batches.
- `hosts_coarse`: the same document in 64-token batches.
- `components_fine`: the same document with a stateful component-backed Copy
  button, exercising hosts whose descendants require reconciled Blocks.
- `text_control`: the same visible text as a scalar return, bypassing generic
  host-child reconciliation; host-tree optimizations should not help this case.

Mount and the first batch are outside the timed window. An untimed pass verifies
every subsequent chunk, checks surviving DOM identity, interacts with the Copy
button and checks its state survives later arrivals, and verifies teardown.
Three complete warmup streams precede the samples. Every timed sample then
checks final content and survivor identity outside its timed window. The
composer is left unchanged throughout. The JSON includes raw sample durations,
shared benchmark statistics, semantic-content hashes, stream length, browser
and Node versions, and source/fixture/corpus/compiler/lockfile/bundle hashes.

`DESCRIPTOR_STREAM_ROOT` selects another checkout's Octane runtime source;
`DESCRIPTOR_STREAM_EXTERNAL_ROOT` selects the checkout providing installed
dependencies and the fixture's hook compiler. Both default to this runner's
checkout. Use the same runner, corpus, dependencies, hook compiler, iteration
count, and machine state for before/after measurements. Runtime source hashes
include uncommitted changes; the Git commit alone is not the candidate identity.

This sidecar measures Octane's generic descriptor renderer. It does not measure
end-to-end application latency or the compiled `.tsrx` fixture's update path.

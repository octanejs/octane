# Switching conversations during a stream

This companion to [chat-stream](../README.md) measures how long a pointer
press takes to reveal a conversation **with the latest reply in the DOM**.
It compares React and compiled Octane Activity trees over the same
`octane/signals` model in headless Chromium. The
[signal-chat example](../../../examples/signal-chat) covers initial document
streaming and hydration. Here the document is already interactive when the
first press arrives.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
node benchmarks/bench.mjs --quick chat-switching
node benchmarks/bench.mjs chat-switching
CHAT_SWITCH_THROTTLE=4 node benchmarks/bench.mjs --results-dir=/tmp/switch-4x chat-switching

# Standalone with an explicit number of measured rounds and an output file
CHAT_SWITCH_THROTTLE=4 BENCH_JSON=/tmp/switch.json node benchmarks/chat-stream/switching/run.mjs 12
```

The runner builds the scripts in memory and serves the page through
Playwright request interception. It runs React first, then Octane, with a
fresh browser for each timing and coverage pass. Each target measures 12 rounds after two
warmups in the same page (`--quick` measures three). Each round mounts a fresh
root with fresh feeds. The unified runner writes `chat-switching.json` under
`benchmarks/results` by default. Use `--repeat=3` for independent browser
processes. The JSON includes the schedule, ordered samples within each switch
kind, function counts by step, tool versions, CPU, viewport and hashes of
the HTML and script combined for each pass.

## Workload

Four synthetic field survey conversations each contain 224 messages, including
questions, notes, readings, checklists, attachment captions and a streamed
field report. A keyless roster signal belongs to the root. Author and presence
families share its projections across panes. Each pane owns a scope with
message families keyed by the local row index. These indexes overlap across
rooms. `createFamily` maps each logical key to a keyless handle.

The React view uses `octane/signals/react`. Each row has four
`useRetainedSignalValue` readers (author, presence, body, status) and one
`useSignalValue` reader (reactions). A word-count preview uses the public
handle’s `.subscribe()` and `.get()` through `useSyncExternalStore`.

The Octane view uses compiled `.tsrx` with four tracked `.get()` calls per
row. Reactions and the preview use Octane’s `useSyncExternalStore` with
`.subscribe()` and `readSignalBinding` so these reads belong to the store
effect and disconnect on hide. For reactions, the native public subscriber
checks for changed values inside the graph. The React binding receives
renderer invalidations and checks its store snapshot. This difference
contributes to the refresh and evaluation counts.

In both views the visible pane has 1,121 readers. A hidden pane
keeps 896 readers observing the graph while its reactions and preview
disconnect. Watched feeds connect on demand and deliver their current value
on reconnect.

The app keeps the two most recently visited panes. Starting in room 0, the
runner presses **1 → 0 → 2 → 1 → 3 → 1 → 0**. The first press fills the
second slot (`first_fill`). The other six give two retained reveals
(`retained`), two first visits with eviction (`cold_evict`) and two returns
after eviction (`remount_evict`). Eviction retires the pane’s scope. Its feed
keeps advancing so the next mount must pick up intervening edits.

Each press has three deterministic feed ticks, one before input, one in the
press handler, and one in the first animation frame after the requested reply
is current. Each tick appends a chunk, edits a historical message and changes
a reaction in **all four** feeds, including hidden and evicted rooms. Every
third tick changes shared presence. Each room streams a different report in
21 chunks.

## Measurements

All three intervals start at the trusted `pointerdown` event’s browser timestamp.

| Interval | Endpoint |
| --- | --- |
| `press_to_commit` | The parent layout effect runs for the selected pane. |
| `press_to_ready` | A layout effect observes the revealed title and the exact reply through the press tick. A retained pane can need a follow-up commit to catch up. |
| `press_to_frame_proxy` | Entry to the second `requestAnimationFrame` callback after readiness, spanning a rendering opportunity and the next stream tick. The callback checks the reply against this later tick. |

`staleAtCommit` records whether the reply was behind at the first layout
effect. These are DOM and animation-frame observations. Actual paint and
display presentation timestamps are outside this measurement. The frame
proxy includes the wait for the browser’s frame cadence. CPU slowdown uses
Chromium’s `Emulation.setCPUThrottlingRate` on the timing page.

The timing pass uses minified production code and ordinary JIT execution.
A second browser runs one unthrottled round with function names preserved,
JIT disabled and CDP precise coverage. It counts function entries separately
for mount, each background tick, each press through the frame proxy, and
disposal. Full transcript and listener checks between steps run outside the
snapshots. The endpoint and teardown checks run within their respective steps.

| Work | Counted function entries |
| --- | --- |
| React store subscription and snapshot checks | `subscribeToStore`, `checkIfSnapshotChanged` |
| Graph registration, cleanup and observer processing | `attachObserver`, `stopObserver`, `runObserver` |
| Keyless derived refresh and getter evaluation | `refreshLean`, `recomputeLean` |
| External connection, cleanup and delivery (including catch-up) | `connectChannel`, `disconnectChannel`, `receiveChannel` |

Every round checks the destination, exact reply, preview, viewport hit tests,
retained DOM identity and evicted node detachment. Warmups and the work pass
also reconstruct the expected fields of every visible row from room, index
and tick, and check the exact active feed listeners after each step. Teardown
checks listener release before scope disposal, scope retirement and the complete
text of all four reports, then publishes after unmount.
Missing coverage, unbalanced registrations, stale settled content and browser
errors fail the run. Compare timings on the same machine and switch schedule.

## Sample results

Two serial runs with Octane at `ff40d6aa6c88`, React 19.2.7, Node 26.12.1
and Chromium 149.0.7827.55 on an Apple M5 Max (macOS, 1024 × 768).
Each renderer handled 84 measured presses at each CPU setting. Values are
milliseconds from the press. The full distributions are in the JSON.

| CPU | Switch | Renderer | Presses | Commit median | Ready median | Ready p95 | Frame proxy median |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1× | First fill | React | 12 | 1.8 | 1.8 | 2.2 | 16.0 |
| 1× | First fill | Octane | 12 | 2.2 | 2.2 | 2.7 | 15.9 |
| 1× | Retained | React | 24 | 0.5 | 1.0 | 1.3 | 16.1 |
| 1× | Retained | Octane | 24 | 0.8 | 0.8 | 0.9 | 16.0 |
| 1× | Cold with eviction | React | 24 | 2.1 | 2.1 | 3.2 | 16.0 |
| 1× | Cold with eviction | Octane | 24 | 2.6 | 2.6 | 3.1 | 16.0 |
| 1× | Remount after eviction | React | 24 | 2.3 | 2.3 | 2.9 | 16.0 |
| 1× | Remount after eviction | Octane | 24 | 2.7 | 2.7 | 3.1 | 16.0 |
| 4× | First fill | React | 12 | 7.6 | 7.6 | 8.5 | 35.5 |
| 4× | First fill | Octane | 12 | 7.6 | 7.6 | 8.8 | 35.2 |
| 4× | Retained | React | 24 | 2.0 | 3.8 | 4.4 | 30.2 |
| 4× | Retained | Octane | 24 | 2.9 | 2.9 | 3.5 | 31.1 |
| 4× | Cold with eviction | React | 24 | 8.5 | 8.5 | 9.3 | 38.8 |
| 4× | Cold with eviction | Octane | 24 | 8.7 | 8.7 | 10.2 | 38.9 |
| 4× | Remount after eviction | React | 24 | 8.6 | 8.6 | 9.6 | 39.3 |
| 4× | Remount after eviction | Octane | 24 | 9.3 | 9.3 | 10.3 | 38.9 |

In React, all 48 retained reveals needed a follow-up commit for the
press-time reply. In Octane, all 48 were current at the first commit.
Both had current replies on all fresh mounts and remounts. Octane
can update hidden content before the press. The background ticks in
the work pass capture some of that cost.

| Step | Renderer | Graph attaches / stops | Derived refreshes / evaluations | External connects / disconnects |
| --- | --- | ---: | ---: | ---: |
| Background tick 4 | React | 0 / 0 | 228 / 229 | 0 / 0 |
| Background tick 4 | Octane | 0 / 0 | 232 / 233 | 0 / 0 |
| Retained 1 → 0 | React | 225 / 225 | 702 / 706 | 1 / 1 |
| Retained 1 → 0 | Octane | 225 / 225 | 702 / 479 | 1 / 1 |
| Remount 2 → 1 | React | 1,121 / 1,121 | 1,146 / 1,148 | 225 / 225 |
| Remount 2 → 1 | Octane | 1,121 / 1,121 | 1,370 / 1,147 | 225 / 225 |
| Final unmount | React | 0 / 2,017 | 0 / 0 | 0 / 450 |
| Final unmount | Octane | 0 / 2,017 | 0 / 0 | 0 / 450 |

The two diagnostic runs returned identical counts within each renderer.
Both kept 896 graph subscriptions attached per hidden pane. The 224
reaction readers and one preview switched graph subscriptions on reveal.
React registered all 1,121 store readers again. A remount also constructs
the pane’s graph and DOM and retires an evicted scope. These timings include
those costs and each renderer’s scheduling policy.

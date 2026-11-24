# Switching conversations during a stream

This companion to [chat-stream](../README.md) measures how long a pointer
press takes to reveal a conversation **with the latest reply in the DOM**.
It runs a production React Activity tree over the workspace versions of
`octane/signals` and `octane/signals/react` in headless Chromium. The
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

The runner builds both scripts in memory and serves the page through
Playwright request interception. The full run measures 12 rounds after two
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

Each row has four `useRetainedSignalValue` readers (author, presence, body,
status) and one `useSignalValue` reader (reactions). A word-count preview
uses the public handle’s `.subscribe()` and `.get()` through
`useSyncExternalStore`. The visible pane has 1,121 readers. A hidden pane
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
and Chromium 149.0.7827.55 on an Apple M5 Max (macOS, 1024 × 768). Each run
measured 84 presses over 12 rounds. Values are milliseconds from the press.

| CPU | Switch | Presses | Commit median | Ready median | Ready p95 | Frame proxy median |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1× | First fill | 12 | 1.9 | 1.9 | 2.2 | 16.0 |
| 1× | Retained | 24 | 0.5 | 1.0 | 1.2 | 15.9 |
| 1× | Cold with eviction | 24 | 2.1 | 2.1 | 2.7 | 16.0 |
| 1× | Remount after eviction | 24 | 2.2 | 2.2 | 2.5 | 15.8 |
| 4× | First fill | 12 | 8.6 | 8.6 | 9.2 | 41.1 |
| 4× | Retained | 24 | 2.5 | 5.0 | 8.1 | 36.6 |
| 4× | Cold with eviction | 24 | 9.6 | 9.6 | 11.5 | 46.9 |
| 4× | Remount after eviction | 24 | 10.3 | 10.3 | 12.4 | 46.2 |

All 48 retained reveals needed a follow-up commit for the press-time reply.
All 120 fresh mounts and remounts had that reply in their first commit.
The two diagnostic runs returned identical counts at every step.

| Step | React registrations | Graph attaches / stops | Derived refreshes / evaluations | External connects / disconnects |
| --- | ---: | ---: | ---: | ---: |
| Retained 1 → 0 | 1,121 | 225 / 225 | 702 / 706 | 1 / 1 |
| Remount 2 → 1 | 1,121 | 1,121 / 1,121 | 1,146 / 1,148 | 225 / 225 |
| Final unmount | 0 | 0 / 2,017 | 0 / 0 | 0 / 450 |

On reveal, React reconnected its store readers. The 896 retained graph
subscriptions per pane stayed attached through hiding. The 224 reaction
readers and one preview switched subscriptions. A remount also constructs
the pane’s graph and DOM and retires an evicted scope, so the latency
difference includes those costs.

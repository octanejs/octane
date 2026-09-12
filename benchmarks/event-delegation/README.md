# Event delegation

Real Chromium dispatches 128 native bubbling `InputEvent`s to distinct hosts in a 512-field application. The correctness gate checks native capture, native bubbling, every framework handler, and every resulting controlled input and output. Timings are published with p95/p99 statistics.

```bash
node benchmarks/bench.mjs --quick event-delegation
node benchmarks/bench.mjs event-delegation
```

## Deterministic delegated-event work

`work.mjs` exercises the same production 512-field application through 128
native `InputEvent`s, with a real framework capture handler on the form and the
existing bubble handlers on its controlled inputs. Its temporary identity
observers are isolated from the ordinary timing runner.

Each event still defines `currentTarget` for capture and bubble, so exactly 256
property definitions remain. The gate requires those definitions to reuse one
descriptor and one getter instead of allocating 256 distinct instances of each.
It also requires the 128 capture traversals to reuse one path array. Native
capture and bubbling, framework capture, event targets, all 128 controlled
inputs, and their corresponding output text must remain correct.

The gate also builds `event-work-no-capture.html` in a separate browser context.
Its own compiled 512-field form has the same controlled input, validation, and
output work but no authored input-capture handler. Importing the main form and
passing an empty capture handler would still register capture at module load, so
the second page uses a separate entry. An observer around the browser's native
`Event.prototype.composedPath` counts only calls for the 128 dispatched input
events and is restored before leaving each fixture. On the no-capture path the
gate requires one path construction per event; the original capture
fixture retains its capture and portal checks. These observers never run in the
ordinary timing application. The unoptimized no-capture baseline constructs
two paths per input event (256 for 128 events).

The isolated page also dispatches one nonbubbling native `play` event on a
`<video>`. Compiled form capture, video bubble, and form bubble handlers must
run in that order with their own `currentTarget` and the video as `target`.
Native document capture and video target listeners must fire, while a native
document bubble listener must not. The shared delegated capture/bubble callback
must call `composedPath()` once for the event (three calls before the change).

The same isolated page also mounts an idle button under a form with authored
`onClickCapture`, button `onClick`, and form `onClick`. Playwright clicks the
button 16 times, producing trusted native events. A temporary `setTimeout`
observer counts zero-delay tasks only between a document capture listener
(before Octane's root capture) and a document bubble listener (after Octane's
root bubble). The gate checks native and framework handler order, trusted event
identity and `currentTarget`, and zero timers for each click that reaches the
bubble listener. This fixture registers capture only for `click`; the input
gate above still exercises its own event type unchanged. The baseline scheduled
one unnecessary fallback timer per click (16 total).

Before those inputs, a separate work-only fixture mounts and unmounts two compiled
JSX portals sharing `document.body` three times. Portal capture, target and bubble
handlers and ref cleanup must all run; detached buttons must stop receiving
delegated clicks, while the second owner stays live after the first unmounts.
The subsequent ordinary input events must perform no sibling
walks or DOM-order comparisons left over from portal ownership. These observers
run only in this deterministic gate, not in the timing application.

The work gate builds its own production fixture, starts a temporary preview, and
closes it before exiting. The unified benchmark runner also invokes the gate
after its existing per-framework timing runs:

```bash
node benchmarks/event-delegation/work.mjs
node benchmarks/bench.mjs --quick event-delegation
```

Set `EVENT_URL` to an existing production `event-work.html` preview that also
serves `event-work-no-capture.html` instead of building one.

## Native dispatch metadata and portal-free paths

`dispatch-work.mjs` builds the production client runtime and mounts a public
root containing a button under eight ancestors, with one capture handler and
nine bubble handlers. For 128 native clicks it checks all 1,280 callbacks,
original event identity, target/currentTarget, and the 128 subsequent native
root listeners. Those native listeners must see their own `currentTarget`,
the original stop method, and no framework-owned public shadows.

```bash
node benchmarks/event-delegation/dispatch-work.mjs
# Observe a separately built baseline without enforcing the new work limits:
node benchmarks/event-delegation/dispatch-work.mjs /tmp/baseline-runtime.mjs --observe
# Persist the detailed work and timing samples:
node benchmarks/event-delegation/dispatch-work.mjs /tmp/candidate-runtime.mjs --output /tmp/event-work.json
```

The work sample temporarily observes Set/Map lookups, portal-parent reads, and
private dispatch symbols. Every observer is restored before timing. The unified
runner receives the counts through `BENCH_JSON`; ratio guards require zero
category Set probes, zero portal-parent reads when no portal exists, no temporary
private dispatch symbols on the Event, and at most two type-record reads per
native click.

| Work for 128 clicks | Baseline `58da3448b` | Candidate |
| --- | ---: | ---: |
| Category/registration Set probes | 1,408 | 0 |
| Type metadata Map reads | 0 | 256 |
| Portal-parent reads | 2,304 | 0 |
| Peak temporary private dispatch symbols per Event | 3 | 0 |
| Framework callbacks / later native listeners | 1,280 / 128 | 1,280 / 128 |

Registration now retains one record per native type, shared by its capture and
bubble registries. It precomputes both handler keys and static category bits;
late registration updates the shared phase bits. Private propagation and
currentTarget values live in reusable frames, one per peak simultaneous logical
phase, with Event, DOM, and function references cleared after each phase. This
moves a bounded amount of work/storage to registration and first use of a nested
dispatch depth; it does not allocate a record per ordinary event.

Portal-free paths skip portal metadata reads. Applications with active portals
retain the existing ownership walk. Portal target creation/removal advances the
existing event-route epoch, so removing the last portal after native capture
cannot discard that delivery's original logical route.

### Public property deletion remains necessary

The original #981 suggestion to retain all Event properties cannot preserve the
native-event contract. `currentTarget` must be absent as an own property after
the logical phase, and the exact prior stop-method descriptors must be restored.
The candidate removes private symbol add/delete churn while preserving those
public restorations. It does **not** claim that native Events never enter V8
dictionary mode, or that all heterogeneous DOM path reads disappear.

### Correctness and negative controls

The current-target, conformance event-listener, capture-events, portal-events,
and event-dedup suites exercise both development and production. The independent
`browser/event-metadata` suite bundles the public production client entry and
runs in Chromium, without requiring the React differential compiler. Its metadata
and portal teardown cases pass against both the frozen baseline and candidate.
They cover retained
outer stop methods during nested dispatch, native descriptor restoration,
redispatch of the same Event, later registration of the bubble phase, and last
portal removal during native target delivery. Additional native open/closed
shadow cases check root rebasing, retargeting, and later native listeners.

Three temporary runtime mutations each failed the corresponding browser case:
using only the innermost frame canceled the wrong logical queue; ignoring the
capture epoch dropped a removed portal's parent; replacing a previously
registered type record dropped its capture phase. Each source snippet was
restored before final validation. Existing controlled input, trusted click,
portal remount, capture fallback, disabled-host, and nonbubbling-family controls
remain in the adjacent suites and `work.mjs`.

### Timing evidence

On macOS arm64 with Node 26.4.0, esbuild 0.28.1, and Chromium 149.0.7827.55, the
event-only patch was applied to a frozen `58da3448b` source snapshot and both sources were bundled with the same
esbuild browser/ESM production defines. Builds finished before measurements.
The fixture warms up with 500 events, observes 128 untimed events, restores all
observers, then measures newly allocated native events plus dispatch and the
same semantic checks.

Four ABBA repetitions used eight fresh Chromium processes per revision, each
with twelve rounds of 2,000 events. Median process medians were 7.2125µs baseline
and 7.025µs candidate (0.974×); process medians ranged 6.050–12.925µs and
5.575–13.625µs respectively. Two further ABBA repetitions used four fresh
processes per revision and sixteen rounds of 10,000 events: 7.355µs versus
7.1125µs (0.967×), with ranges 6.325–10.510µs and 5.715–9.390µs. These broad,
overlapping ranges do not establish a throughput gain. The regression gates
therefore enforce work counts, not an elapsed-time threshold.

```bash
./node_modules/.bin/esbuild /tmp/baseline/packages/octane/src/runtime.ts \
  --bundle --platform=browser --format=esm \
  --define:process.env.NODE_ENV='"production"' \
  --define:__OCTANE_PROFILE_ENABLED__=false --outfile=/tmp/baseline-runtime.mjs
# Repeat the same build for candidate-runtime.mjs, then run B,C,C,B twice:
EVENT_TIMING_EVENTS=10000 EVENT_TIMING_ROUNDS=16 \
  node benchmarks/event-delegation/dispatch-work.mjs /tmp/baseline-runtime.mjs --observe
EVENT_TIMING_EVENTS=10000 EVENT_TIMING_ROUNDS=16 \
  node benchmarks/event-delegation/dispatch-work.mjs /tmp/candidate-runtime.mjs
```

The isolated full runtime bundle grows from 341,561 to 342,274 minified bytes
(+713, 0.21%) and from 107,521 to 107,811 gzip bytes (+290, 0.27%) with esbuild
0.28.1. Registration records retain two computed keys per registered native type;
reusable dispatch frames retain five fields per peak nesting depth and clear all
object/function references between phases. These costs buy the work reductions
above; there is no claim of eliminating public Event dictionary normalization.

This narrow fixture isolates dispatch work after mount. It does not establish
application responsiveness, trusted-input latency, or a gain for active-portal
paths. The existing compiled controlled-form/trusted-click work gate provides
separate integration coverage; native shadow/slot routing remains covered by the
existing browser boundary suites.

Final targeted validation used these suites (development and production runtime
projects) plus the independent production browser and existing work gate:

```bash
./node_modules/.bin/vitest run packages/octane/tests/current-target.test.ts \
  packages/octane/tests/conformance/event-listener.test.ts \
  packages/octane/tests/capture-events.test.ts packages/octane/tests/portal-events.test.ts \
  packages/octane/tests/event-dedup.test.ts
./node_modules/.bin/vitest run --project octane-events-browser \
  packages/octane/tests/browser/event-metadata/event-metadata.test.ts
node benchmarks/event-delegation/work.mjs
```

The local runtime run used a scoped config retaining the repository's development
and production setup while omitting the unrelated React differential precompile,
whose `@tsrx/react-runtime` dependency was unavailable. It passed 132 tests; the
independent production browser suite passed four cases. Both production work
gates passed, including all 128 controlled edits and 16 trusted captured clicks.

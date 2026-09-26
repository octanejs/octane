# Stop-then-adopt streamed recovery probe

This is a **benchmark-only synthetic fixture**, not a Signal Chat Metrics
implementation, optimizer, or general binding handoff. It keeps the existing
document streamed-signal bridge while an independently registered, manually
bound keyed frame owns a timer. On a server abort it waits for both the marked
pending sentinel and the joined query error, imports the ordinary renderer while
the binding stays live, and rechecks its local lifecycle generation, connected island,
same marked sentinel, and error before synchronously disposing the binding and
hydrating under the same document owner. One stable handle disposes either
phase. The extra recovery subscription and observer are removed at handoff.

The renderer receives the early tick as an explicit prop. This deliberately
carries one scalar across the stop; it does not transfer hook state, a timer,
event handlers, or an atomic structural lease. The normal renderer starts a
new timer. The catch region is recovered by the normal hydration path. The
ordinary control hydrates the same server output from the start under the same
bridge, without first binding the frame.

In the retained Chromium 149 run, all nine cases passed:

- Ordinary and stop-then-adopt both reached `Configuration failed` after a
  real server abort and the fixture's **1,800 ms receiver inactivity timeout**
  (the production default is 30 seconds). The run does not measure a recovery
  latency distribution. Both preserved this fixture's frame and keyed row.
  The ordinary path recorded one 400 ms timer start and one eventual stop.
  The handoff recorded two starts and two eventual stops, with a peak of one
  concurrent 400 ms timer: the early timer stopped before the renderer timer
  started. The early row value was 4 at handoff and advanced to 5 after it.
- The renderer's active scope reported the exact document owner captured from
  the bridge. Every case recorded one server loader and zero client loaders.
  Two additional recovery calls during a held import still produced one attempt.
  Disposing the parent while that import was held prevented adoption; removing
  the sentinel's error marker while it was held also prevented the stale
  adoption. Early bindings continued ticking during the held import.
- Successful resolution kept early binding and handled one trusted button
  click. Server rejection placed catch UI without starting the renderer. The
  import-failure control retained the pending UI and early timer until explicit
  disposal. The deliberately invalid hydrate container stopped early binding
  and left pending UI with no active timer. These are recorded failure states,
  not automatic recovery from failed imports or partial renderer adoption.
- After the real abort ended its response, the driver separately injected a
  synthetic `$OCTRC` carrier for the former sentinel and a protocol-shaped,
  ordered promise result (`open`, `value`, `complete`) for the selected
  identity. The carrier was removed and catch UI and query error remained.
  The public global receiver returns no disposition, so this is an observed
  state check, not a direct assertion of the receiver's rejection reason. These
  frames are adversarial injections, not bytes delivered by the aborted stream.

The browser driver checks page errors and failed requests. The deliberate
import failure recorded one `net::ERR_FAILED` request for the fallback asset;
all other request failures were rejected. Each intentional server abort
reported one Octane error #42. Console output and server stdout/stderr are not
collected. Cleanup assertions cover one unmount, zero early frame/signal
subscriptions and zero measured 400 ms timers. The run uses one local Chromium
sample for functional checks, not a performance or transfer comparison.

The synthetic manifest and manual disposal do not reproduce the full Signal
Chat bootstrap or parent remount, BFCache, navigation, CSS, or real Metrics
export state. In particular, this fixture's ready-behavior gate is one-shot:
ready-to-pending/error transitions, refresh, reselection, and retry are not
modeled. It does not establish exactly-once events during the synchronous
replacement, transient activation or native default actions, nor preservation
or cancellation of real in-flight app work, hook state, timer deadline, or a
partially completed adoption. The held-sentinel change is synthetic. A declined
or failed attempt remains latched and cannot retry; a declined attempt keeps
the early path alive. A failed import or hydrate leaves pending UI, and failed
hydrate leaves that presentation inert after stopping the early owner. There
is no general retry or post-activation recovery protocol.

Run from the worktree root with an installed authorized Chromium:

```sh
PLAYWRIGHT_EXECUTABLE_PATH='/absolute/path/to/authorized/chromium' \
  node benchmarks/streamed-shell-prototype/opaque-recovery/run.mjs
```

`--build-only` skips Chromium. The historical temporary evidence directory was
named `octane-opaque-recovery-8qDoE0` and is not published here.
Its `manifest.json` SHA-256 is
`e430363c0cc257af99277a8e84baca300e1dab4ea8f7f8145efc77f60313ecbd`;
`result.json` SHA-256 is
`37713227e317c41f32bfc919f5ed2d23e56e5bbb35e69ffe0273d6a18ad873f0`.
The manifest hashes the runner, fixture and build-loaded repository inputs,
compiler sources, lockfile, emitted server and client assets. Inputs are
checked before and after the run. This README and the complete installed
dependency/host environment are outside that manifest.

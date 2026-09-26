# Binding a view inside an unresolved server range

This is a **negative-control diagnostic**, not an optimizer or a replacement
for Signal Chat's Metrics component. It probes one proposed shape: the same
compiler-supported view appears inside the pending, success and catch arms of
an actual streamed `@try`, and the host binds that view before or after the
server reveals the next arm. The held `query$` executes once on the server;
real incremental HTTP output and its inline `$OCTRC`/`$OCTRX` instructions
run in the browser parser. The driver publishes a snapshot update and dispatches
a native click before and after placement for the early-bound success and
rejection cases. In the reveal-first case the click and updates occur after
placement; in the abort case no click is dispatched after abort. It records
node identity, subscriptions, DOM, server writes and cleanup.

```sh
PLAYWRIGHT_EXECUTABLE_PATH='/absolute/path/to/authorized/chromium' \
  node benchmarks/streamed-shell-prototype/metrics-binding-race/run.mjs
```

`--build-only` emits both bundles and a provenance manifest without starting a
browser. A complete run prints a temporary output directory containing the
manifest, emitted artifacts and `result.json`. The manifest records fixture,
compiler, lockfile and the source files recorded from the server and client
builds; it is not a complete hash of installed dependencies or the host system.

The success and rejection arms are expected to expose the unsafe case: when a
host binds the pending view, the server's normal placement can replace its
section. The original binding remains subscribed to a detached node; the new
visible button has no binding listener. The driver requires those negative
observations and checks disposal removes the subscription and listener. When
success reveals first, the view can be adopted and remains connected. The abort
case invokes `stream.abort()` on the server. The expected `$OCTRX` marks the
pending sentinel for client recovery; the pending view remains and the server
reports its abort error. The `<main>` container retains its identity
across success, rejection and abort when the view was bound before the stream
instruction. In the reveal-first case the container is captured only afterward.
The abort case does not simulate a network disconnect or pagehide.

The data source and its updates are deliberately simple: they are not the
Metrics controller or its 400 ms timer, keyed log, export operation, or actual
session state. The pending test button is also synthetic; Signal Chat's actual
pending arm has no export button. This fixture does not run independent-island
bootstrap, share its document signal owner, exercise captured-intent replay,
or test parent update/remount and mismatch fallback. In particular it does not
show that waiting in an independent activator is safe: the island registry can
mark replay ready before an asynchronous activator finishes. No size or
performance conclusion follows from this test.

Signal Chat's ordinary independent activator uses `hydrateRoot` directly. On a
pending try, the renderer claims the range for client rendering by removing the
server sentinel and fallback before mounting a fresh branch; a later server
swap then cannot replace it. This differs from the separate ordinary Hydrate
boundary's internal reveal wait, and neither supplies a public ownership handoff
for a binding host. Preserving the actual `@try` server stream plus early
binding requires a proven ownership/reconciliation design and the full Metrics
behavioral checks before an application-level result can be claimed.

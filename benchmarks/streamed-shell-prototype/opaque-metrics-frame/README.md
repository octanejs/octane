# Opaque streamed Metrics frame probe

This is a **benchmark-only behavioral probe**, not an optimizer or Signal Chat
implementation. It asks whether a bindable outer frame can run while an
unresolved `@try` remains server-owned. It does not change or claim the stream
sentinel, remove server nodes, or install a new range takeover protocol.

The server and client compile the same module-scope `query$` source with the
same absolute filename and compiler root. The client joins the existing document
streamed-signal bridge before reading that query. A synthetic registered
load-triggered independent island binds a shared keyed frame, starts one 400 ms
timer, and registers a behavior around its opaque child. The real incremental
server stream places a bindable ready view or catch text through its normal
`$OCTRC` script. A behavior observer adopts the ready view; delegated capture
can retain a click while that behavior's readiness is deliberately held.
Unmounting the registration disposes its frame, behavior, timer, and signal
subscription. The separate document bridge remains alive until the server
stream finishes.

The driver checks actual parser execution in Chromium for:

- Reveal before activation, and activation before reveal. The frame and keyed
  row remain connected and unchanged across the latter reveal. The ready node
  is the original server node in both cases; a trusted click reaches the
  synthetic action once. In the second case the driver deliberately holds the
  behavior gate, clicks before adoption, then releases the gate.
- A stale queued target. The driver replaces the clicked button while readiness
  is held. The old click is not delivered to its replacement; clicking the
  live replacement works after adoption.
- Query rejection. The real server places its catch text and the joined signal
  reports an error; no ready view is adopted.
- Server `stream.abort()`. The real `$OCTRX` marks the pending sentinel. The
  fixture shortens the receiver inactivity timeout to 1.8 seconds (the normal
  default is 30 seconds). After timeout the joined signal reports an error, but
  the untouched server-owned range still displays its pending text. This is an
  **unsupported recovery case**, not a passing parity result.
- Disposal before reveal. The independent registration unmounts once, stops the
  timer and subscriptions, and the subsequently streamed button remains inert.
  Successful cases also click after disposal and wait longer than one timer
  interval to check both the event listener and timer are inactive.

Each case asserts one server loader and zero client loaders, one active frame
and signal subscription while mounted. The driver asserts no unexpected page
errors, failed requests, island-registration errors, or server `onError`
callbacks; the intentional abort produces the one expected server error. It
does not collect browser console messages or server stdout/stderr. These are
tests of this fixture's contract, not measurements of execution time or bundle
size.

This fixture uses a synthetic island manifest and parent lifetime; it does not
run Signal Chat's real generated bootstrap, outer root, preHydrate hook, export
RPC, observation log, or route navigation. The button only records a native
click; it does not model the real export operation. The behavior's readiness
gate is a test control, and its handling of an already-finished click is not a
claim that native default actions or transient user activation can be replayed.
Events before behavior registration, late mismatches, late renderer fallback,
parent remount and the abort recovery above remain unproved. There is no normal
renderer fallback or automatic eligibility analysis in this diagnostic.

Run from the worktree root with its installed dependencies and an authorized
Chromium executable:

```sh
PLAYWRIGHT_EXECUTABLE_PATH='/absolute/path/to/authorized/chromium' \
  node benchmarks/streamed-shell-prototype/opaque-metrics-frame/run.mjs
```

`--build-only` builds without starting Chromium. Each run prints a temporary
output directory with `manifest.json`, emitted server/client artifacts and
`result.json`. The manifest hashes fixture sources, compiler sources, lockfile
and build-loaded repository inputs; it is not a complete record of installed
dependencies or the host system.

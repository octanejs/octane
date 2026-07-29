# Lynx dual-thread render benchmark

This Node-only suite drives the real Octane Lynx path end to end: the
production background root, the async transport, the main-thread receiver, and
the Element PAPI host driver, connected by an in-process ContextProxy pair. The
Element PAPI behind it is a cheap fake, so the reported milliseconds are
Octane's own per-node CPU cost — the part of a native run a framework controls —
rather than native element allocation, layout, or paint.

```bash
node benchmarks/bench.mjs --quick lynx-render
```

Targets:

- `empty_startup_ms` — root construction, readiness, and one empty commit.
- `create_1k_rows_ms` / `create_10k_rows_ms` — one mount of a keyed row list
  shaped like the Vue-Lynx unified benchmark matrix: an id cell, a tappable
  label cell, and a tappable remove cell per row.

The suite also gates the native event path. A background `bind*` handler is
resolved by the engine through `lynxCoreInject.tt.publishEvent` on the
background thread, so the click check installs real tokens through `__AddEvent`
and then delivers a tap through that receiver. A build where the receiver is
missing reports `handler DID NOT RUN` and fails the suite.

This makes no native paint, layout, adoption, memory, or device claim. Those
remain the Android/iOS gates described in the Lynx renderer plan.

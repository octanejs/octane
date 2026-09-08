# External-store fan-out

This benchmark connects 512 independently rendered subscribers to the same
observable external store in production-built Octane, React, Preact, Solid 2,
Svelte, Vue Vapor, and Inferno applications.

Octane, React, and Preact use `useSyncExternalStore`; Inferno and the
signal-based renderers use their native lifecycle and subscription primitives.
Real Chromium verifies that
a narrow write changes only its intended visible subscriber, a broad write
updates all 512 subscribers consistently, rapid consecutive writes do not tear,
and teardown balances subscription acquisition/removal without retaining listeners. Snapshot calls,
notifications, subscriber renders, and subscription cleanup are published as
diagnostics alongside timing.

```bash
node benchmarks/bench.mjs --quick external-store-fanout
node benchmarks/bench.mjs external-store-fanout
```

## Notification-work guard

`work.mjs` builds the same Octane fixture and sends 100 notifications in one
browser task. It runs unchanged, broad, and narrow bursts separately. The
notification-phase snapshot reads are counted before rendering starts; later
render and commit reads are reported separately. Every phase checks the final
visible values and retained subscriber DOM, and teardown must release every
listener.

The `octane-tsrx-work` and `required-work` targets feed deterministic ratio
guards. A broad burst needs at most one snapshot comparison to schedule each
reader; a narrow burst still checks the untouched readers on every notification.
Unchanged notifications must not render subscribers. These are work ceilings,
so a future implementation can do less work without breaking the guard.

```bash
node benchmarks/external-store-fanout/work.mjs
node benchmarks/bench.mjs --quick --ratios external-store-fanout
```

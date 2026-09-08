# Universal collapsed-template event updates

This Node-only benchmark measures shape-stable handler updates through the
public universal root and the fallback collapsed-template host capability. It
uses 128 and 1,024 event-bearing hosts so the same-run ratio exposes work that
scans every accepted event for every next event.

Fixture construction, handler allocation, initial mount, event dispatch,
identity checks, and teardown stay outside the timed interval. Each scale point
retains every host, rebinds every handler, dispatches the final handler through
the public object driver, and verifies that updates emit no redundant host event
commands. The driver rejects prepared template programs so the benchmark cannot
silently measure the separate indexed program path.

```bash
node benchmarks/universal-template-events/run.mjs 7
node benchmarks/bench.mjs --quick universal-template-events
```

The suite makes no DOM, native-device, layout, paint, or allocation claim.

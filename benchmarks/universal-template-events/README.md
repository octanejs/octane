# Universal event updates

This Node-only benchmark measures shape-stable handler updates through the
public universal root. `events-128` and `events-1024` use the fallback
collapsed-template host capability; `regular-events-128` and
`regular-events-1024` use the ordinary object driver and its per-host staged
event path. The two sizes expose work that scales with the number of listeners.

Fixture construction, handler allocation, initial mount, event dispatch,
identity checks, and teardown stay outside the timed interval. Each scale point
retains every host, rebinds every handler, dispatches the final handler through
the public object driver, and verifies that updates emit no redundant host event
commands. The ordinary path also verifies its initial distinct listener IDs,
zero template commands, zero handler-only host commands, and that an original
listener ID still invokes the latest handler. The fallback driver rejects
prepared template programs so those controls cannot silently measure the
separate indexed program path.

```bash
node benchmarks/universal-template-events/run.mjs 7
node benchmarks/bench.mjs --quick universal-template-events
```

To compare already built source bundles with an identical benchmark harness,
set `BENCH_RUNTIME_URL` to the absolute `file:` URL for a production
`dist/universal.js`. This skips the build; the package must have been built
with the same toolchain.

The suite makes no DOM, native-device, layout, paint, or allocation claim.

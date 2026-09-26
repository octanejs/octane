# Shared Metrics presentation: ordinary hydration checkpoint

This benchmark copies Signal Chat twice and compares its unchanged Metrics with
a manually refactored presentation under **ordinary Octane hydration**. It is
preparation for a possible DOM-bindings activator, not an automatic optimizer,
an implemented binding candidate, or a performance win. Neither the example,
framework, generated bootstrap nor the other experiments are changed.

The copied `Metrics.tsrx` retains the original hooks, layout effect, shared
capture functions, export helper, `session$` and streamed `@try`. It projects
the original timing and observation values into rows for `MetricsFrame.tsrx`,
which is the single authored presentation and carries the explicit
`'use dom bindings'` assertion. The asynchronous child remains `unbound` at the
original sibling position. This directive is a programmer assertion about the
view, not an automatic proof of the controller, props or lifetime.

Moving the `@try` through the child changes generated SSR: both versions emit a
pending `data-oct-b` sentinel and ordinary `$OCTRC` placement, but the shared
view has extra binding/opaque comment markers. The recorded sentinel identities
also differ, but include a render-unique salt and cannot establish whether the
refactor changed their allocation. The output is **not** byte-identical. The build checks
that the five independent-island records have the same metadata apart from
their emitted module filenames and that stylesheet contents are identical.
The verifier saves and hashes each actual HTTP document or aborted prefix.

The paired verifier checks real incremental pending→success and rejection,
an HTTP client disconnect while the server session is pending, and the session
producer's start/terminal counts. It exercises a browser case where Metrics
starts its one 400 ms timer before the delayed session completes, then verifies
the streamed ready view, matching exported observation values and timing rows,
keyed row and section identity, native `<details>` open state and focus across
an update, and selected element shapes/styles at desktop and mobile widths.
It verifies the real JSON download and an injected 503 error. A separate case
holds an export request, dispatches a synthetic non-persisted `pagehide`, checks
the timer stops, then verifies that the already-started export still downloads.
Capture-disabled and rejected-session cases are also exercised. These are
bounded functional cases, not a proof for BFCache, all navigation/remounts,
late query refresh or retry, truncation, overlapping exports, every CSS rule,
or renderer handoff. The disconnect case is an HTTP client abort, not a
browser `stream.abort()` test. Unexpected browser errors are asserted; server
logs must contain exactly the four expected SSR error reports from the single
intentional document disconnect.

The frame allocates projected arrays and row objects on updates. The tests do
not measure their CPU or garbage-collection cost. Byte data and behavior do not
establish per-tick performance parity.

From the worktree root with dependencies already present:

```sh
node benchmarks/streamed-shell-prototype/metrics-shared-view/build.mjs
PLAYWRIGHT_EXECUTABLE_PATH='/absolute/path/to/authorized/chromium' \
  node benchmarks/streamed-shell-prototype/metrics-shared-view/verify.mjs \
  /absolute/path/printed/by/build
```

`build-report.json` contains source, benchmark, selected framework and lockfile
hashes, the two copied-source maps, all emitted artifact hashes, independent
metadata and the Vite graph. `verification.json` links the build hash and
records the observed cases, saved document hashes, browser-requested initial JS
body sizes and server response sizes. The graph separates the static entry
closure, dynamically reachable JS and all reachable files; gzip-9 totals are
offline sums per emitted file. There is no separate lightweight candidate or
lazy fallback in this stage. Browser sizes are a single local no-interaction
checkpoint, not production traffic or a timing result. The hashes do not fully
describe installed dependencies, Chromium or the host operating system.

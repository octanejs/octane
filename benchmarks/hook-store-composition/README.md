# Hook and store composition

An Octane-only production-browser baseline for runtime callback composition and
actual external-store bindings. The fixture contains 128 independently rendered
rows and precomputes immutable numeric records before each measured operation.
Every update burst performs 20 discrete public `flushSync` commits.

| Lane | Public implementation | Operations |
| --- | --- | --- |
| `callback-direct` | `useCallback` in the component body | unrelated parent renders; changed dependencies |
| `callback-nested` | the same callback through two compiler-processed custom-hook call sites | the same matched callback operations |
| `raw-store` | `useSyncExternalStore` over a real Zustand vanilla store | parent renders; new snapshots with unchanged selected values; changed selected values |
| `zustand-traditional` | `@octanejs/zustand/traditional` over the same vanilla-store shape | the same visible-state operations, with stable selectors returning object slices and a value equality function |
| `mobx` | `observer` from `@octanejs/mobx`, observing public MobX computed selections | the same visible-state operations, with computed-value equality |

The callback lanes are a matched workload comparison. The three store lanes are
independent baselines over equivalent visible state: their notification models,
selection representations, and internal work differ. A cross-lane timing ratio
does not isolate binding overhead or establish library parity. Existing
`external-store-fanout`, `store-selector-fanout`, and
`external-store-integrations` remain the broader comparative suites.

## Controls and timing boundary

The callback dependency array arrives through a prop, so the default production
compiler retains the runtime hook instead of replacing an eligible literal-array
call with inline memo cells. The nested leaf lives in a fully compiled `.tsrx`
module; a plain TypeScript forwarding chain would not establish the same nested
call-site paths. Both callback bodies capture the same report function, row index,
and value.

Native button clicks after the measured update check the callbacks' actual
results, retained identities when dependencies are unchanged, and new identities
with current captures when dependencies change. An additional untimed control
calls the same nested hook twice in one component scope with equal dependency
values; its distinct outputs and identities must remain independent. The
observation registry is cleared between probes and on teardown.

Store setup waits for the shell's real passive-effect acknowledgment and all
expected subscribers. It then performs a genuine broad write and restore, checking
every visible row both times. This matters for MobX: a tracked Reaction can exist
before its external-store subscription is installed. No test-only effect-drain API
is used. A later real write must still reach all rows; the Zustand lane additionally
replaces its selector as an untimed semantic control. Teardown waits for an empty
root and zero retained listeners or public MobX observers.

`run.mjs` uses a minified production build. Each timer surrounds only the update
burst, with no Playwright round trip, polling, or frame wait inside it. The timer
stops before verification, but visible output is verified synchronously in the
same browser task. Every row must have the correct value and parent generation,
and its original DOM node must survive. Three warmup samples precede the requested
measured samples. Chromium is launched with `--expose-gc`; when available, explicit
GC runs before each sample and outside the timer. Results record that availability,
Node/Chromium versions, platform, and architecture alongside the shared `BENCH_JSON`
and statistics contracts.

## Separate production-work diagnostics

`work.mjs` makes an unminified production build and runs Chromium with JIT disabled.
It reuses `benchmarks/lib/precise-work.mjs` to count named calls to `useCallback`,
`useMemo`, `resolveHookArgs`, `resolveSlot`, `appendSlotKey`, and `withSlot` without
adding probes to the component render bodies. An operation must activate at least
128 × 20 runtime callbacks; the nested operation must actually reach the composed
slot path. Native identity probes and cleanup run only after the coverage snapshot.

The actual-binding diagnostics use separate fixture instances with instrumented
store reads, selectors, equality functions, and subscription lifecycles. Their
counts are not timing samples. Vanilla-store diagnostics report real notification,
subscribe, unsubscribe-invocation, disposal, and duplicate-cleanup counts. MobX
reports source-snapshot reads, selector/equality calls, public computed-observation
transitions, and retained observers. Observation transitions are **not** Reaction
creation/disposal counts. Equality counts cover the user-supplied Zustand comparator
or MobX computed comparator; the raw lane's runtime `Object.is` calls are not
instrumented. No component-render count is inferred from these metrics.

The work payload omits `iterations`, so merging it into the unified result cannot
overwrite the timing sample count. This baseline-only suite has no new timing or
private-helper cost ratio limits. Establish and review measurements with the
pinned toolchain before adding deterministic cost budgets to
`benchmarks/baselines/ratios.json`.

## Run

```bash
node benchmarks/bench.mjs --quick hook-store-composition
node benchmarks/bench.mjs hook-store-composition

node benchmarks/hook-store-composition/run.mjs 8
node benchmarks/hook-store-composition/work.mjs
pnpm exec tsrx-tsc --noEmit -p benchmarks/hook-store-composition/tsconfig.json
node --test benchmarks/lib/precise-work.test.mjs
```

Both runners accept `--no-build` after their respective production build exists.
The suite reuses the repository's installed Vite, Playwright, Octane, Zustand, and
MobX packages. Its resolver follows the workspace packages' public export maps;
it does not require another workspace package or dependency versions. Run baseline
and candidate sequentially, with the same lockfile, compiler, browser, machine,
warmup, and iteration count. A successful source inspection or syntax check is not
a benchmark result.

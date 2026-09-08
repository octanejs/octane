# Root caught-error reporting: performance evidence

Measured on 2026-08-22 against baseline commit
`f1a78026e19f9db5c524b185f3a51cdd5a88e7cd`, archived before implementation.

- Baseline `runtime.ts` SHA-256: `704d023c6d47728817fd590a54c83a8f60f2de7ea6bdf8ce4726cd44216cc667`.
- Candidate `runtime.ts` SHA-256: `4efe7af4b0c2b8aae8a736d392676ee918d1c68b9b154a08205f4584666ba97f`.
- Environment: macOS arm64, Node 26.4.0, esbuild 0.28.1, `@tsrx/core` 0.1.58,
  esrap 2.3.2, and happy-dom 20.11.0.

The configured registry blocked the native parser package before installation
finished its links and repository-declared patches. Initial exploratory runs
preceded that setup repair and are not the final evidence below. Both revisions
were rerun after completing task-local dependency/workspace links and applying
the already-committed patches by copy-on-write, without changing shared caches.
The final measurements use the same locked benchmark dependencies, including the
declared `@tsrx/core` patch; a second baseline execution reproduces all three JSON
results exactly.

Compilation selects the repository's shipped browser parser through its default
package-import condition. No alternative registry or blocked package was used.
These are browser-parser measurements, not native-parser validation.

## Cost and lifetime

Ordinary component renders gain no fields, closures, or arrays. The existing
commit-action drain keeps its empty fast path, adds a result check per existing
action, and supplies a commit-local report list checked after layout. Visible
Activity updates and teardown add a reveal-storage lookup. Those constant checks
are real costs that source-creation counters do not measure.

Configured inline catches allocate one registration closure. Hidden catches also
register a cleanup on first parking; disposing that catch removes its exact
action even when its hidden owner survives. Reports reuse the existing reveal
storage, extended to Activity, rather than adding a per-component map. Owner
disposal, fresh primary mounts, and terminal catches clear retained work.
Reconnect-context and ancestor searches run only while registering an actual
caught error. Activity reveal wrappers are allocated only for parked actions.
Only a surviving visible action creates a report record, and only commits with
reports allocate the local report list. Identity/disposal checks cancel obsolete
catches; commit-local lists prevent nested commits from publishing another
commit's reports before its refs and layout effects.

## Deterministic work

All **993 non-bundle hook-memo metrics** are unchanged, including compiled fixture
sizes and source-creation counters. Output, value, callback identity, and
clean-versus-observed controls pass. Fixture, entry, observer, runner, and toolchain
metadata match between revisions.

A focused healthy-boundary probe reuses the unchanged hook-memo observer after
production compilation and bundler tree shaking. It covers a plain leaf control,
catch-only `@try`, `@try/@pending/@catch`, literal `<ErrorBoundary>`, and
`createElement(ErrorBoundary)`, each with and without `onCaughtError`. Every
configuration creates a root, mounts, performs 64 value-changing parent renders,
and unmounts. Every render checks output, surviving leaf/section identity, absence
of fallback content, and zero caught-error reports; teardown empties the root.
Clean and observed executions agree.

All **320 counters across those 40 phases** are identical. During each 64-update
sequence, plain and compiled boundaries create no observed runtime functions or
arrays. Compiled boundary caller plumbing retains its existing 64 application
arrays; descriptor boundaries retain their existing 128 runtime functions and
192 runtime rest arrays. Configuring the root callback does not change those
update counts. These are source-creation events, not a complete heap-allocation
census; object literals and allocations inside native built-ins are not counted.

All 32 compiler files and `runtime.server.ts` are byte-identical. The observer's
own value, lexical-closure, naming, and copy-on-write controls pass **2/2**.

## Production bytes

| Retained surface / fixture | Minified bytes, before → after | Gzip bytes, before → after | Gzip delta |
| --- | ---: | ---: | ---: |
| `attachBehaviorRoot` | 12,044 → 12,044 | 3,748 → 3,748 | 0 |
| `createRoot` | 112,578 → 112,832 | 36,501 → 36,588 | +87 |
| Root + state | 115,340 → 115,594 | 37,484 → 37,565 | +81 |
| Root + compiler `errorBlock` | 115,754 → 116,970 | 37,523 → 37,903 | +380 |
| Root + public `ErrorBoundary` | 138,344 → 139,778 | 44,312 → 44,770 | +458 |
| Root + Suspense | 138,137 → 139,571 | 44,224 → 44,686 | +462 |
| hook-memo runtime-form fixture | 141,616 → 141,880 | 44,875 → 44,958 | +83 |
| hook-memo inline fixture | 143,283 → 143,547 | 45,417 → 45,499 | +82 |
| Healthy-boundary fixture | 154,913 → 156,423 | 48,780 → 49,211 | +431 |

The behavior-only bundle is byte-identical and excludes `runtime.ts`. Export
surfaces use esbuild bundling, minification, tree shaking, ESM/browser/ESNext,
production mode, disabled profiling, and gzip level 9. Root combinations also
retain `createElement`, except the compiler-helper probe. They are retained export
surfaces, not representative application bundles. Fixture sizes come from clean
unobserved bundles; their bundle target is ES2022.

## Commands and raw evidence

Local runners, fixtures, source snapshots, manifests, and JSON results are under
`/private/tmp/octane-824-perf-20260822-o6b3aceo`. Its `baseline` and `candidate-final`
directories preserve the measured sources; `performance-comparison.json` records
all deltas and verifies source/provenance equality. The baseline manifest includes
the exact Git commit and per-file SHA-256 values.

Run each source root with the same installed dependency root and result path:

```sh
OCTANE_MEMO_ROOT="$BENCH_SOURCE_ROOT" \
OCTANE_MEMO_EXTERNAL_ROOT="$BENCH_DEPENDENCY_ROOT" \
BENCH_JSON="$BENCH_RESULT_JSON" \
node --import /private/tmp/octane-824-callbacks-browser-parser.mjs benchmarks/hook-memo/run.mjs

node --import /private/tmp/octane-824-callbacks-browser-parser.mjs \
  /private/tmp/octane-824-perf-20260822-o6b3aceo/healthy-boundaries.mjs \
  "$BENCH_SOURCE_ROOT" "$BENCH_DEPENDENCY_ROOT" "$BENCH_RESULT_JSON"

node /private/tmp/octane-824-perf-20260822-o6b3aceo/bundle-surfaces.mjs \
  "$BENCH_SOURCE_ROOT" "$BENCH_DEPENDENCY_ROOT" "$BENCH_RESULT_JSON"

python3 /private/tmp/octane-824-perf-20260822-o6b3aceo/compare-performance.py
node --test benchmarks/hook-memo/instrument.test.mjs
```

Each probe has `-baseline.json`, `-baseline-recheck.json`, and `-candidate.json`
results. The supported parser loader SHA-256 is
`eef9d084eac53e4b09075364d8688e5fa1439512b885654061993be0e43a5fd6`;
the unchanged lockfile SHA-256 is
`047dfc5585e0dc60fbc9c3e3622af61d52bbb45dbc64ac717d9dd1bbdce91372`.
The declared core patch SHA-256 is
`1ce4d5ad217fbae79df568fcb088bb50bef3478506b420b8084c4f1e8df6c5b2`;
its patched `src/transform/jsx/index.js` SHA-256 is
`99feeaf7920877c55330e013caeeee9ff6d0950e8fe6f285909c5cc8e28826ac`.
`dependency-repair-report.json` records the verified copy-on-write repair, while
`pre-repair-evidence` preserves the superseded exploratory results separately.

## Limits

No latency, garbage-collection, or universal no-regression claim is made.
Error-heavy throughput, Activity lookup overhead, reconnect-owner searches,
long-lived hidden-report retention, and browser hydration throughput were not
timed. SSR throughput was not repeated because the server runtime and compiler
are unchanged. This audit establishes unchanged measured healthy-render work and
the added production-byte cost; behavioral regression tests and current-head CI
remain separate correctness gates.

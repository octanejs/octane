# Incomplete descriptor retries: performance evidence

Measured on 2026-08-22 against baseline commit
`5b1e6a36afcf87077de159a360f910a3e4c36537`, archived before implementation.

- Baseline `runtime.ts` SHA-256: `4efe7af4b0c2b8aae8a736d392676ee918d1c68b9b154a08205f4584666ba97f`.
- Candidate `runtime.ts` SHA-256: `01efbc2fe8ff2705e109f16dab3caed1c6c223828f67f5f393a064838ff2da8e`.
- Environment: macOS arm64, Node 26.4.0, esbuild 0.28.1, `@tsrx/core` 0.1.58,
  Vite 8.1.5, Playwright 1.61.1, Chromium 149.0.7827.55.

Both revisions use the same task-local, exact-lockfile dependency links and
already-approved package payloads, copied without changing earlier worktrees.
Repository-declared patches were verified before measurement. The configured
registry's native-parser policy block was not bypassed: compilation uses the
repository's shipped browser parser. These are not native-parser measurements.
All six compared baseline reports reproduce their earlier JSON results exactly.
The comparison verifies 193 archived source/benchmark files and the live candidate
runtime hash; only `runtime.ts` differs between the source snapshots.

## Cost and lifetime

The retry status is separate from mount lifetime, scheduling, and replay flags.
Valid work can still bail; failed or discarded work must finish another render
before its already-advanced props become reusable.

| Path                                  | Added cost                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block creation                        | One initialized numeric `renderStatus` property, with valid/invalid/retrying states. Its actual heap-byte cost was not measured.                                                                                                                                                                              |
| Ordinary render                       | A status comparison at entry, a capture-null check, and a status comparison on successful completion. Entry/completion writes occur only for a status transition.                                                                                                                                             |
| Memo/identity and compiler cache hits | Direct status reads; compiler cache guards inspect the existing current render owner. No new per-hit map or allocation.                                                                                                                                                                                       |
| Incomplete render                     | Cold owner/ancestor walks mark the logical path and invalidate existing keyed-item dependency caches. Lite scope proxies do not gain scheduler fields.                                                                                                                                                        |
| Captured render                       | Two fields on each existing capture and one lazy `Set` for its executed blocks. Recording performs ownership checks and inserts; discard walks recorded blocks and their ancestors. Commit/discard release the capture's set/root references; nested commit transfers records to its surviving outer capture. |
| First Suspense hide                   | A scan of the current pending layout/passive queues, with ownership/revision checks, restores canceled effect dependencies and invalidates affected paths. It can inspect unrelated queued entries before filtering them; it is not a per-render scan.                                                        |
| Descriptor writes                     | Changed raw text and descriptor stamps add a journal-null check. An active transition journal records the previous text/descriptor stamp for rollback. Ordinary text updates add no DOM getter beyond the existing comparison; active text journaling reads the old value.                                    |

These guards, the permanent field, and capture bookkeeping are real costs, even
where the work counters below are identical. The focused retry probe has no
large pending-effect queue or deeply nested capture tree; it does not establish
a worst-case bound on their wall-clock cost. No global retry registry or retry
epoch invalidates unrelated roots.

## Healthy memo, identity, and compiler work

The unchanged canonical `memo-wall` work harness passes for both production
`.tsrx` and returned-JSX fixtures. All **140 function-call counts** are identical
between revisions: seven operations, ten counters, two dialects. Its existing
DOM/render-count semantic gates also pass. Selected common counts are:

| Operation                  | `RowsA` | Keyed survivor visits | Compiled item bodies | Row / Inner / Leaf bodies |
| -------------------------- | ------: | --------------------: | -------------------: | ------------------------: |
| Mount both 1,000-row walls |       1 |                     0 |                1,000 |     2,000 / 2,000 / 2,000 |
| Equal update, wall A       |       0 |                     0 |                    0 |                 0 / 0 / 0 |
| Change one item, wall A    |       1 |                 1,000 |                    1 |                 1 / 1 / 1 |
| Context update, wall A     |       0 |                     0 |                    0 |             0 / 0 / 1,000 |
| Change one item, wall B    |       0 |                 1,000 |                    0 |                 1 / 1 / 1 |
| Context update, wall B     |       0 |                     0 |                    0 |             0 / 0 / 1,000 |
| Equal update, wall B       |       0 |                     0 |                    0 |                 0 / 0 / 0 |

The dialects' different descriptor-creation call counts also remain unchanged.
Coverage is collected after compilation with Chromium precise-call coverage and
`--jitless`, so counting does not mutate a compiler-proven pure region.

All **993 non-bundle hook-memo metrics** are unchanged, including generated-code
sizes and observed source-creation events. Value, callback identity, and
clean-versus-observed controls pass; the observer's own controls pass **2/2**.

All 32 compiler files and `runtime.server.ts` are byte-identical. Compiling the
same archived memo-wall modules with production `autoMemo: true` produces
byte-identical output hashes and sizes:

| Module       | Generated bytes, before and after |
| ------------ | --------------------------------: |
| `.tsrx` App  |                             9,085 |
| `.tsrx` rows |                             3,661 |
| JSX App      |                             9,920 |
| JSX rows     |                             4,591 |

## Retry work and locality

A separate plain-JavaScript descriptor workload follows the public regression:
mount `initial`, suspend on a new promise, reveal `next`, then repeat for `last`.
It includes an unchanged memo sibling and an identity-cached descriptor sibling.
No source counters or compiler purity changes are inserted. All ten candidate
resolutions reveal the new value and preserve the main/reader/sibling DOM nodes;
the baseline incorrectly reveals `initial` without rerunning the reader.

| Descriptor shape  | Reader bodies per resolve, before → after | `renderBlockInner` calls per resolve, before → after | Candidate capture-record calls per resolve |
| ----------------- | ----------------------------------------: | ---------------------------------------------------: | -----------------------------------------: |
| Host              |                                     0 → 1 |                                                1 → 6 |                                          6 |
| Nested hosts      |                                     0 → 1 |                                                1 → 9 |                                          9 |
| Cached descriptor |                                     0 → 1 |                                               1 → 10 |                                         10 |
| Memo ancestor     |                                     0 → 1 |                                                1 → 9 |                                          9 |
| Memo reader       |                                     0 → 1 |                                                1 → 6 |                                          6 |

Each suspension still executes the reader once. Both unaffected sibling bodies
execute **zero times** during every suspension and resolution. The additional
retry work repairs omitted work in the broken baseline; its lower counts are
not a valid performance advantage. The candidate invokes the new pending-effect
scan once per first hide, and each measured resolution still creates one
existing offscreen capture, now with executed-block tracking.

The same browser graph also mounts the canonical 2,000-row compiled wall in an
independent root. Across **nine healthy-update phases**, including the first and
repeated equal updates after each unrelated suspension/resolution, all **27
call-count metrics** match baseline. `refreshCachedBlock` and
`refreshBlockForContext` are both zero, as are row/inner/leaf bodies; all 2,000
row nodes and their text remain unchanged.

An exploratory global-epoch implementation caused 4,001 cache-refresh visits on
the first unrelated-root update. That version was rejected. The measured final
three-state local status removes those visits without disabling healthy bails.

## Production bytes

| Retained surface / fixture     | Minified bytes, before → after | Gzip bytes, before → after | Gzip delta |
| ------------------------------ | -----------------------------: | -------------------------: | ---------: |
| `attachBehaviorRoot`           |                12,044 → 12,044 |              3,748 → 3,748 |          0 |
| `createRoot`                   |              112,832 → 113,802 |            36,588 → 36,975 |       +387 |
| Root + state                   |              115,594 → 116,564 |            37,565 → 37,924 |       +359 |
| Root + memo                    |              114,619 → 115,589 |            37,247 → 37,557 |       +310 |
| Root + compiler `errorBlock`   |              116,970 → 117,940 |            37,903 → 38,272 |       +369 |
| Root + public `ErrorBoundary`  |              139,778 → 141,102 |            44,770 → 45,218 |       +448 |
| Root + Suspense                |              139,571 → 140,895 |            44,686 → 45,135 |       +449 |
| hook-memo runtime-form fixture |              141,880 → 142,816 |            44,958 → 45,256 |       +298 |
| hook-memo inline fixture       |              143,547 → 144,483 |            45,499 → 45,859 |       +360 |

The behavior-only output is byte-identical and excludes `runtime.ts`. Surface
probes use esbuild bundling/minification/tree shaking, ESM/browser/ESNext,
production mode, disabled profiling, and gzip level 9. Root combinations also
retain `createElement`, except the compiler-helper probe. These are retained
export surfaces, not representative application sizes. Hook-memo sizes are from
clean, unobserved ES2022 bundles.

## Commands and raw evidence

Local runners, fixtures, source snapshots, manifests, and JSON results are under
`/private/tmp/octane-825-perf-20260822-b7t2ifb1`. The immutable source directories
are `baseline` and `candidate-final-01efbc2fe8ff`.
`performance-comparison.json` records the deltas and provenance checks. These
scratch adapters select a source root for the unchanged repository harnesses;
they are not shipped benchmark changes.

From the issue worktree, run the Node probes for each source and result label
(`baseline-recheck` or `candidate`):

```sh
AUDIT_DIR=/private/tmp/octane-825-perf-20260822-b7t2ifb1
AUDIT_DEPS=/Users/domgan/.codex/worktrees/octane-825-incomplete-suspense-retries
AUDIT_PARSER=/private/tmp/octane-825-browser-parser.mjs
AUDIT_SOURCE="$AUDIT_DIR/candidate-final-01efbc2fe8ff"
AUDIT_LABEL=candidate

OCTANE_MEMO_ROOT="$AUDIT_SOURCE" OCTANE_MEMO_EXTERNAL_ROOT="$AUDIT_DEPS" \
  BENCH_JSON="$AUDIT_DIR/hook-memo-$AUDIT_LABEL.json" \
  node --import "$AUDIT_PARSER" benchmarks/hook-memo/run.mjs
node "$AUDIT_DIR/bundle-surfaces.mjs" "$AUDIT_SOURCE" "$AUDIT_DEPS" \
  "$AUDIT_DIR/bundle-surfaces-$AUDIT_LABEL.json"
node --import "$AUDIT_PARSER" "$AUDIT_DIR/compiler-output-evidence.mjs" \
  "$AUDIT_SOURCE" "$AUDIT_DIR/compiler-output-$AUDIT_LABEL.json"

node "$AUDIT_DIR/run-final-browser.mjs"
python3 "$AUDIT_DIR/compare-performance.py"
node --test benchmarks/hook-memo/instrument.test.mjs
```

The browser batch runs `memo-wall-evidence.mjs` for both source roots and both
dialects, then `retry-work-evidence.mjs` for each source. The memo-wall adapter
builds the unchanged fixture with the selected compiler/runtime, invokes the
unchanged `benchmarks/memo-wall/work.mjs`, and runs `run.mjs 1` for its semantic
gates. Chromium required execution outside the local filesystem sandbox; no
browser or package was downloaded for these runs.

The raw reports record source, fixture, runner, observer, and generated-code
hashes. In particular, the retry driver SHA-256 is
`4ac0bdffb416e6d1e83a1b9b9579105870871efad9b45547b8d8ebc073393a6a`
and its measurement runner SHA-256 is
`8ee18c16b2e77ffd3beba8fc399e8c20f98a72bc067e98c7fb5036a051defae2`.

These results establish deterministic work and code size, **not latency or
heap-byte neutrality**. The unminified, jitless coverage runs are not production
speed measurements; timing values from `run.mjs 1` were not used. The source
observer counts selected creation expressions, not every allocation or retained
field. This audit does not establish native-parser behavior, SSR/hydration
throughput, or worst-case transition-journal/effect-queue latency.

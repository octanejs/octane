# Incomplete descriptor retries: performance evidence

Measured on 2026-08-22 against baseline commit
`5b1e6a36afcf87077de159a360f910a3e4c36537`, archived before implementation.

- Baseline `runtime.ts` SHA-256: `4efe7af4b0c2b8aae8a736d392676ee918d1c68b9b154a08205f4584666ba97f`.
- Candidate `runtime.ts` SHA-256: `a62893efc9de26b4dbd73b4e4568339518247e79407863a6712b72e8d8c88fb1`.
- Environment: macOS arm64, Node 26.4.0, esbuild 0.28.1, `@tsrx/core` 0.1.58,
  Vite 8.1.5, Playwright 1.61.1, Chromium 149.0.7827.55.

This supersedes the audit for runtime
`01efbc2fe8ff2705e109f16dab3caed1c6c223828f67f5f393a064838ff2da8e`
(commit `283c20eba`), following the held-transition rollback correction. The
baseline commit is unchanged; earlier reports and runners remain archived.

Both revisions use the same task-local, exact-lockfile dependency links and
already-approved package payloads, copied without changing earlier worktrees.
Repository-declared patches were verified before measurement. The configured
registry's native-parser policy block was not bypassed: compilation uses the
repository's shipped browser parser. These are not native-parser measurements.
Five unchanged baseline reports reproduce the previous audit's results exactly.
The expanded retry report was rerun identically and preserves every original
semantic result and counter. Its added held-transition case and journal-append
metric are not claimed to be identical to the old full JSON. The comparison
verifies 193 archived source/benchmark files and the live candidate
runtime hash; only `runtime.ts` differs between the source snapshots.

## Cost and lifetime

The retry status is separate from mount lifetime, scheduling, and replay flags.
Valid work can still bail; failed or discarded work must finish another render
before its already-advanced props become reusable.

| Path                                  | Added cost                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block creation                        | One initialized numeric `renderStatus` property, with valid/invalid/retrying states. Its actual heap-byte cost was not measured.                                                                                                                                                                              |
| Ordinary render                       | A status comparison at entry, capture/journal-null checks, and a status comparison on successful completion. Entry/completion writes occur only for a status transition.                                                                                                                                      |
| Memo/identity and compiler cache hits | Direct status reads; compiler cache guards inspect the existing current render owner. No new per-hit map or allocation.                                                                                                                                                                                       |
| Incomplete render                     | Cold owner/ancestor walks mark the logical path and invalidate existing keyed-item dependency caches. Lite scope proxies do not gain scheduler fields.                                                                                                                                                        |
| Captured render                       | Two fields on each existing capture and one lazy `Set` for its executed blocks. Recording performs ownership checks and inserts; discard walks recorded blocks and their ancestors. Commit/discard release the capture's set/root references; nested commit transfers records to its surviving outer capture. |
| First Suspense hide                   | A scan of the current pending layout/passive queues, with ownership/revision checks, restores canceled effect dependencies and invalidates affected paths. It can inspect unrelated queued entries before filtering them; it is not a per-render scan.                                                        |
| Descriptor writes                     | Changed raw text and descriptor stamps add a journal-null check. An active transition journal records the previous text/descriptor stamp for rollback. Ordinary text updates add no DOM getter beyond the existing comparison; active text journaling reads the old value.                                    |
| Held transition journal               | Every executed body under an open journal appends four slots to the existing flat log, independently of WIP capture. Rollback checks disposal/ownership and invalidates owned live paths. This follow-up adds no field, set, or capture; log growth may allocate backing storage.                             |

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
repeated equal updates after each unrelated suspension/resolution, all original **27
call-count metrics** match baseline. `refreshCachedBlock` and
`refreshBlockForContext` are both zero, as are row/inner/leaf bodies; all 2,000
row nodes and their text remain unchanged.
The new journal-append counter is also zero in all nine phases.

An exploratory global-epoch implementation caused 4,001 cache-refresh visits on
the first unrelated-root update. That version was rejected. The measured final
three-state local status removes those visits without disabling healthy bails.

### First held transition without a WIP capture

One focused follow-up case mounts both readers synchronously, then starts a
transition in which the earlier memo reader finishes with its new value before
the later memo reader suspends. The baseline leaks the earlier reader's new text
with its old title, then never finishes the later reader. The candidate keeps
both original text/title pairs visible while held and publishes both new pairs
when the promise resolves, preserving the same DOM nodes.

| Phase                | Earlier / later reader bodies, before → after | `renderBlockInner` calls, before → after | Candidate render-journal entries |
| -------------------- | --------------------------------------------: | ---------------------------------------: | -------------------------------: |
| First held attempt   |                                 1 / 1 → 1 / 1 |                                  10 → 10 |                               10 |
| Resolve              |                                 0 / 0 → 1 / 1 |                                    1 → 8 |                                8 |
| Settled equal update |                                 0 / 0 → 0 / 0 |                                    8 → 8 |                                0 |

The first held attempt creates **zero offscreen captures** and records no
captured renders, so this exercises the previously missing capture-independent
path. Its ten `JOURNAL_RENDER` appends add 40 flat-log slots; resolution adds
eight entries, or 32 slots, while using one existing offscreen capture. The
unchanged memo and identity siblings execute zero bodies during hold, resolve,
and the settled equal update. Both changed readers also resume their normal
memo bailout on that final update.

The append count comes from the innermost V8 detailed-coverage range containing
the new render-record append to the existing log, after compilation. The
measurement does not instrument runtime source. Counts describe log entries,
not backing-store bytes or CPU time.

## Production bytes

| Retained surface / fixture     | Minified bytes, before → after | Gzip bytes, before → after | Gzip delta |
| ------------------------------ | -----------------------------: | -------------------------: | ---------: |
| `attachBehaviorRoot`           |                12,044 → 12,044 |              3,748 → 3,748 |          0 |
| `createRoot`                   |              112,832 → 113,904 |            36,588 → 37,006 |       +418 |
| Root + state                   |              115,594 → 116,666 |            37,565 → 37,954 |       +389 |
| Root + memo                    |              114,619 → 115,691 |            37,247 → 37,612 |       +365 |
| Root + compiler `errorBlock`   |              116,970 → 118,042 |            37,903 → 38,310 |       +407 |
| Root + public `ErrorBoundary`  |              139,778 → 141,218 |            44,770 → 45,282 |       +512 |
| Root + Suspense                |              139,571 → 141,011 |            44,686 → 45,195 |       +509 |
| hook-memo runtime-form fixture |              141,880 → 142,918 |            44,958 → 45,324 |       +366 |
| hook-memo inline fixture       |              143,547 → 144,585 |            45,499 → 45,922 |       +423 |

The behavior-only output is byte-identical and excludes `runtime.ts`. Surface
probes use esbuild bundling/minification/tree shaking, ESM/browser/ESNext,
production mode, disabled profiling, and gzip level 9. Root combinations also
retain `createElement`, except the compiler-helper probe. These are retained
export surfaces, not representative application sizes. Hook-memo sizes are from
clean, unobserved ES2022 bundles.

## Commands and raw evidence

Local runners, fixtures, source snapshots, manifests, and JSON results are under
`/private/tmp/octane-825-perf-20260822-b7t2ifb1`. The immutable source directories
are `baseline` and `candidate-final-a62893efc9de`.
`performance-comparison.json` records the deltas and provenance checks. These
scratch adapters select a source root for the unchanged repository harnesses;
they are not shipped benchmark changes.
The superseded reports, runner copies, and audit are in
`superseded-01efbc2fe8ff`; the earlier source snapshot remains intact at
`candidate-final-01efbc2fe8ff`.

From the issue worktree, run the Node probes for each source and result label
(`baseline-recheck` or `candidate`):

```sh
AUDIT_DIR=/private/tmp/octane-825-perf-20260822-b7t2ifb1
AUDIT_DEPS=/Users/domgan/.codex/worktrees/octane-825-incomplete-suspense-retries
AUDIT_PARSER=/private/tmp/octane-825-browser-parser.mjs
AUDIT_SOURCE="$AUDIT_DIR/candidate-final-a62893efc9de"
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
`3e2d40b0bf26227d94d4bef2dbbf3102b223acbba9bb06067a25692dfc262549`
and its measurement runner SHA-256 is
`19986aa7e349b621c42853ef2d2990a83c03c06544c4d9557d9176b014fb6738`.

These results establish deterministic work and code size, **not latency or
heap-byte neutrality**. The unminified, jitless coverage runs are not production
speed measurements; timing values from `run.mjs 1` were not used. The source
observer counts selected creation expressions, not every allocation or retained
field. This audit does not establish native-parser behavior, SSR/hydration
throughput, or worst-case transition-journal/effect-queue latency.

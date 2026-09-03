# lynx-table

The unified cross-framework table benchmark for Octane's Lynx renderer: the
krausest-style row table (`app/`, mirrored operation-for-operation from the
Vue Lynx unified benchmark matrix) driven through create / update-every-10th /
select and the update (×50) / select (×30) storms, where every storm tick runs
in its own MessageChannel macrotask so app-layer batching cannot merge them.

It has two halves with different claims:

## 1. Deterministic wire-cost gates (`run.mjs`, CI-gated)

```bash
node run.mjs [iterations]          # LYNX_TABLE_SCALES=1000,10000 by default
```

Builds the app plus the real dual-thread path (background root, async
transport, main-thread receiver, host driver) with the Octane compiler, drives
the ops through real native tap tokens over an in-process ContextProxy pair,
and reports per-operation **command counts**, **serialized commit bytes**, and
**Row component render counts**
from the `__OCTANE_LYNX_PROFILE__` counters (`@octanejs/lynx`'s permanent,
build-flag-gated wire profiler — `globalThis.__OCTANE_LYNX_PROF` on each
thread). Counts are deterministic for a fixed app and interaction sequence, so
they carry ratio guards in `../baselines/ratios.json` against the
`changed-rows-model` target — the commands and component renders a change of
that size strictly implies. Creating any number of component-owned rows must
emit one shared-template run. Selection allows two Row body executions;
update-every-10th allows `ceil(rows / 10)`. The Row counter is compiled out of
normal browser and production builds. These gates keep wire payload and render
breadth proportional to change size, not tree size. The suite runs from the
root runner:

```bash
node benchmarks/bench.mjs --only lynx-table --ratios
```

Because the in-process ContextProxy is synchronous, acknowledgements return
immediately and the storm gates see one commit per tick; the asynchronous
"renders while a commit is in flight coalesce into the next commit" contract
is pinned separately in `packages/octane/tests/universal-transport.test.ts`.
This harness starts directly on the background renderer; production
first-screen adoption and the subsequent capability handoff are covered by the
Lynx first-screen integration tests and the real-browser harness below.

### Native eager-capacity fixture

The `BENCH_AUTOROWS` production builds at 1k, 6k, 7k, 7.5k, 8k, and 10k are
inputs to the opt-in issue #888 capacity diagnostic. They preserve the table's
seven-native-elements-per-row topology plus 42 fixed chrome elements. They are
unranked capacity probes, not a substitute for the separate bounded
`list`/`list-item` workload, and load-to-crash chronology is never a timing
sample.

```bash
for rows in 1000 6000 7000 7500 8000 10000; do
  BENCH_AUTOROWS="$rows" pnpm --dir benchmarks/lynx-table build:app
done
node --test benchmarks/lynx-table/stages/native-fixture.test.mjs
```

The fixture test pins the topology and exact supported scales. Strict Android
process/log classification, accepted-sample policy, immutable campaign
receipts, and the no-CDP device procedure belong to the external
`Huxpro/lynx-js-framework-benchmark` runner.

## 2. Lynx-for-Web wall-clock harness (`web/run-web.mjs`, informational)

```bash
node web/run-web.mjs               # octane + all vendored references
node web/run-web.mjs --scales 1000,10000,30000 --reps 3 --cells octane,vue-vdom
```

Builds the app's `main.web.bundle` with the repo's own Rspeedy toolchain
(`scripts/build-app.mjs`), serves it and the vendored reference bundles into a
`<lynx-view>` (`@lynx-js/web-core` + headless Chromium via Playwright), drives
real clicks, waits for shadow-piercing composed-DOM predicates, and emits a
markdown report (`results/web.md`) with medians of n≥3 (fresh page per
rep) plus ratios versus the `vue-vdom` cell. Absolute milliseconds are
host-bound; the ratios are the portable claim — the report prints both.

### Reference cells

`reference/{vdom-ifr-et,vapor-ifr,react}/main.web.bundle` are vendored
black-box fixtures: ReactLynx (`@lynx-js/react`), the Vue vdom top config
(`vdom +b +ifr`, legacy id `vdom-ifr-et`), and the Vue vapor top config
(`vapor +b +ifr`, legacy id `vapor-ifr`), built once from Huxpro/vue-lynx
branch `claude/lynx-implementation-review-n2r0ie`:

```bash
pnpm install && pnpm --filter "vue-lynx..." build \
  && cd packages/benchmark \
  && node harness/build-unified.mjs --only=vdom-ifr-et,vapor-ifr,react
```

then only the `.web.bundle` files are copied here. `reference/manifest.json`
records the source commit. If a reference bundle is absent the harness prints
"not measured" for that cell and continues — it never substitutes a number
from a degraded run.

### Measurement honesty rules (non-negotiable)

- No octane-only bespoke workloads: the app mirrors the reference apps'
  workload operation-for-operation, and `web/driver-client.mjs` is the
  byte-identical instrument for every cell.
- Every published number comes from the same instrument that measured the
  references on the same host in the same session.
- A cell that cannot be driven end-to-end is reported "not measured", never as
  a number from a degraded run.

## 3. Stage-decomposition instrument (`stages/run.mjs`, informational)

```bash
node stages/run.mjs --smoke --rows 1000 --allow-busy-host
node stages/run.mjs --reps 5
node stages/run.mjs --fcp-only --reps 7 --rows 10000 --output-tag candidate-attribution
node stages/run.mjs --fcp-production-ab --reps 7 --rows 10000 \
  --baseline-bundle /absolute/path/to/baseline/main.web.bundle \
  --candidate-bundle /absolute/path/to/candidate/main.web.bundle \
  --min-content public --output-tag production-ab
```

The reportable command builds control and `__OCTANE_LYNX_PROFILE__` variants,
requires `n >= 5`, opens a fresh page for every sample, alternates control and
profile order `AB / BA / AB / ...` in one host window, and runs one vendored
`vue-vdom` create sample after each pair. It records CPU/OS/Node/Chromium, host
load at both ends, medians, min-max spread, raw milliseconds, shares, and
same-window ratios. Do not run other builds, tests, browsers, or benchmark
processes during that window. The default quiet-host preflight rejects a
one-minute load average above `0.5 * logical CPUs`; `--allow-busy-host` exists
only for non-reportable smoke/debug runs or an explicitly disclosed
candidate-only exception. Production baseline/candidate A/B always remains
reportable and rejects that override.

FCP performance decisions use two deliberately separate protocols:

- **Production baseline/candidate A/B.** `--fcp-production-ab` takes two explicit
  production bundle paths, rejects profiling markers or identical bundle
  SHA-256s, records each absolute path, byte length, and SHA-256, and alternates
  fresh-page baseline/candidate samples AB / BA with `n >= 5` under the
  mandatory quiet-host preflight. Neither cell reads profiler state. The default
  `--min-content public` measures the public first-content threshold of five
  content nodes; `--min-content all` instead measures the first frame whose
  table row count is exactly N. Every settled sample must also preserve the same
  deterministic `{finalRows: N, finalCount, checksum}` semantic tuple across
  both cells. It writes a standalone
  `*-production-ab-<rows>.{json,md}` report with both FCP and settled timing.
- **Candidate-only attribution.** The ordinary `--fcp-only` session builds
  profile-off and profile-on variants of the same candidate. Its same-window
  control/profile ratio quantifies measurement overhead; only the profiled
  candidate contributes stage attribution. Those cells are not the production
  baseline and candidate.

The Phase A baseline owner measurements and a final candidate attribution run
occur in different host windows. They can show that a candidate still has (or
has shifted) directly observed cost, but subtracting their medians is not a
same-window owner-removal result. Only the production baseline/candidate AB/BA
session supports the end-to-end removal claim; candidate-only attribution then
explains where the candidate's remaining time went.

The archived Phase A FCP@N evidence predates the exact row predicate and used
`contentCount >= N`. This table's current first-screen batch reaches its tail in
one publication flush, so those two signals were observed in the same frame,
but that is an inference rather than a reusable measurement contract. Final
candidate attribution must use exact `rowCount=N`. Production A/B may use the
declared public threshold or exact all-N predicate, and both modes require the
settled N-row semantic tuple above.

The reusable analyzer and protocol tests are:

```bash
node --test stages/*.test.mjs
```

### Observation contract

Every directly timed interval is exclusive. The analyzer rejects a sample when
direct intervals exceed its wall clock instead of normalizing or guessing.

**FCP@10k** starts when the shared browser init hook assigns the hidden
main-thread iframe's Blob script URL (before browser load/parse/evaluation) and
ends at the first animation-frame observation where the shared composed-tree
driver sees all 10,000 rows:

1. `mt_slice_eval`: Blob script assignment through the first `root.render()`
   call, including browser load, parse, and evaluation.
2. `plan_interpretation`: nested time inside first-screen `renderPlanNode`
   walks.
3. `first_screen_render_other`: the enclosing first-screen render after
   subtracting plan interpretation and command staging.
4. `first_screen_command_staging`: template selection, command materialization,
   and batch freezing.
5. `first_screen_host_container`: main-local host-container creation.
6. `first_screen_host_prepare`: clone-safe host batch preparation.
7. `papi_element_creation`: nested Element PAPI page/element/list creation.
8. `first_screen_host_apply_other`: host apply after subtracting PAPI creation.
9. `first_screen_capture`: adoptable first-tree capture.
10. `publication_layout_predicate_residual`: the exclusive wall-clock
    remainder through Web Core publication, style/layout, and observer-frame
    delay.

The analyzer enforces both nesting relations: plan plus command staging cannot
exceed first-screen render, and PAPI creation cannot exceed host apply. It then
subtracts the nested intervals so every reported segment is exclusive.

Raw view-attach FCP is also reported for control/profile overhead and same-run
comparison, but decode/fetch before slice evaluation remains outside the
exclusive stage attribution.

**create@10k** starts at the byte-identical page driver's `pointerdown` boundary
and ends when that same driver sees 10,000 rows:

1. `bg_replay`: native-event delivery through completion of background render,
   diff, command staging, and plan folding, stopping before outbound self-check.
2. `wire_clone_transfer`: the existing ContextProxy `dispatchEvent` interval.
3. `mt_expand`: main-thread wire-shape preparation before host preparation.
   Historical plan-wire samples measure `instantiate` expansion; rebased
   template-program samples measure incremental-run capability validation and
   freezing under the same archived profile field.
4. `papi_element_creation`: time inside Element PAPI page/element/list creation
   calls.
5. `layout_flush_residual`: the exclusive wall-clock remainder, including
   event delivery before replay, validation/prepare, non-create PAPI work,
   flush/layout, scheduling, and observer-frame delay.

Snapshots are collected from the real hidden main-thread iframe and background
worker, copied as numeric own properties, and parsed without prototype or
`instanceof` checks. The profiler extends the existing
`__OCTANE_LYNX_PROFILE__` record; its runtime branches are absent when the
define is false, and `stages/analyze.test.mjs` gates that production fold
boundary with byte-equal bundled output against a control entry.

Downstream verdicts use a declared direct-share gate: `GO` requires a directly
observed target segment (or target segment sum) to contribute at least 10% of
the operation's median attribution. Residual time never authorizes a step.

## Claims and non-claims

Command counts and commit bytes are Octane-owned costs and are gated. The
in-process milliseconds and the Lynx-for-Web wall clock are CPU/browser-host
costs — no native paint, layout, adoption, or device claim. Native gates
remain the separate Android/iOS story (`docs/lynx-native-renderer-plan.md`).

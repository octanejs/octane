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
that size strictly implies. Selection allows two Row body executions;
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

## Claims and non-claims

Command counts and commit bytes are Octane-owned costs and are gated. The
in-process milliseconds and the Lynx-for-Web wall clock are CPU/browser-host
costs — no native paint, layout, adoption, or device claim. Native gates
remain the separate Android/iOS story (`docs/lynx-native-renderer-plan.md`).

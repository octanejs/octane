# Transition and hook hot paths

This Node-only benchmark drives one production application through the
transition and state-hook paths that React-parity fixes tend to touch, and
counts what the runtime creates while doing so. It exists so a correctness fix
on these paths shows its cost as a deterministic count rather than a disputed
microsecond.

```bash
node benchmarks/bench.mjs --ratios transition-hooks
node benchmarks/transition-hooks/run.mjs
BENCH_JSON=/tmp/transition-hooks.json node benchmarks/transition-hooks/run.mjs
OCTANE_TRANSITION_TIMING=0 node benchmarks/transition-hooks/run.mjs   # counts only
```

There are no preview servers or browser downloads. The fixture compiles with
production client settings and bundles with the real Octane runtime into
happy-dom, exactly as `hook-memo` does.

## Scenarios and semantic controls

Every scenario mounts once, then repeats a complete cycle 64 times through the
public API. A cycle calls the hook setters, lets the runtime's own microtask
scheduling run until four consecutive ticks render nothing, and then checks the
observed render sequence and the DOM. The fixtures create no per-render
closures of their own: the runner composes `start(() => setValue(next))`, so
every application creation event belongs to the compiled template.

| Scenario | Cycle | Control |
| --- | --- | --- |
| `cycle` | `start(() => setValue(next))` | two renders: pending cue with the new value, then the falling edge; text `next:idle` |
| `updater` | `start(() => setValue((v) => v + 1))` | identical render sequence to `cycle` through the queued-updater path |
| `held` | transition to a value whose `use()` request is pending, then resolve it | hold: pending cue, then the cue re-render with the committed value, no fallback, previous text retained; release: promotion, then the falling edge with the new text |
| `dispatch` | `setValue((v) => v + 1)` outside any transition | exactly one render |
| `bail` | `setValue(same)` on an idle cell | no render at all |
| `click` | a native `button.click()` whose delegated handler dispatches a functional update | exactly one render through the discrete-event flush |
| `urgent` | `start(() => setChild(next)); setParent(next)` in the same tick | parent renders once; the child renders its committed value under the urgent parent render, then the transition value, then the falling edge |

The `held` and `urgent` sequences pin behaviors the September 2026 React
behavioral audit corrected; a checkout that predates them cannot run those
scenarios. `OCTANE_TRANSITION_SCENARIOS=cycle,updater,held,dispatch,click`
selects a subset for such an A/B run, and the result records the subset in
`meta.run.scenarios` so it is never mistaken for a full run.

## What the numbers mean

The clean bundle runs first and establishes semantics, bytes, and timing. The
same bundle is then instrumented **after** compilation and tree-shaking with the
`hook-memo` observer in its extended mode, which also counts object literals and
non-Array `new` expressions. The observed run must reproduce the clean run's
render sequences exactly. Counts are attributed to the application or the
Octane runtime through the bundle's source map and reported per scenario:
`<scenario>_renders`, `<scenario>_runtime_functions`, `_runtime_arrays`,
`_runtime_objects`, and `_runtime_constructors`, with application counts kept
in the metadata.

The `work-model` target supplies fixed ceilings as a per-cycle budget times the
64 cycles, plus a one-time allowance where a runtime capability installs lazily
on the first cycle. Positive references let the committed ratio guards enforce
exact ceilings, including zero for the same-value bailout, the eager functional
dispatch, and delegated click closures. A breach means a path that used to be
allocation-free started creating closures, arrays, objects, or collections, or
that a cycle started rendering more often.

These are **source-level creation events, not a V8 heap census**. Timings
(`<scenario>_us`, median and steady-window score in microseconds per cycle after
1,000 warmup cycles, 40 samples of 500 cycles; the held and urgent scenarios use
200 warmups and 40 samples of 100) are secondary evidence and carry no guard:
this machine-dependent signal is smaller than ordinary run-to-run noise for the
cheapest cycles. `code_minified` is the compiled fixture; `bundle_gzip` includes
the tree-shaken runtime.

`OCTANE_TRANSITION_ROOT` selects another Octane source checkout and
`OCTANE_TRANSITION_EXTERNAL_ROOT` the checkout supplying installed dependencies.
Keep Node, dependencies, fixture, and runner identical for a before/after
comparison; the result records their hashes and versions.

## Initial measurement

On 2026-09-03 the suite compared the audit baseline `33720d8ef`, the audited
runtime `44d50dbc0`, and the follow-up that removed per-transition hook `Set`
allocations, on Node 24.18.0 with the same installed dependencies. Runtime
creation events per 64 cycles:

| Scenario | Counter | `33720d8ef` | `44d50dbc0` | Follow-up |
| --- | --- | ---: | ---: | ---: |
| `cycle` | constructors | 192 | 256 | 192 |
| `updater` | constructors | 192 | 256 | 192 |
| `held` | constructors | 896 | 1,025 | 961 |
| `held` | arrays / objects | 4,544 / 1,472 | 4,480 / 1,344 | 4,480 / 1,344 |
| `urgent` | constructors | n/a | 448 | 384 |

Every other counter and every render count was identical across the three
runtimes. The audited runtime's extra constructor per transition was the
`Set` it allocated to track a batch's starting hooks; the follow-up stores the
first hook in a field and counts pending batches on the hook. The one remaining
`held` allocation over the baseline is the hook-holder registration a suspended
transition creates when it holds; it stays on that cold path. The `urgent`
scenario has no baseline column because the baseline rendered the child's
transition value under the urgent parent render, which the audit corrected.

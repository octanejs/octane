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
public API. A cycle calls the hook setters, lets the runtime's own scheduling
run until four consecutive microtask ticks and the host task after them render
nothing (transition renders flush in a posted task, #1864), and then checks the
observed render sequence and the DOM. The fixtures create no per-render
closures of their own: the runner composes `start(() => setValue(next))`, so
every application creation event belongs to the compiled template.

| Scenario | Cycle | Control |
| --- | --- | --- |
| `cycle` | `start(() => setValue(next))` | two renders: the pending cue with the committed value, then the new value with the falling edge in the transition's task; text `next:idle` |
| `updater` | `start(() => setValue((v) => v + 1))` | identical render sequence to `cycle` through the queued-updater path |
| `held` | transition to a value whose `use()` request is pending, then resolve it | hold: the pending cue with the committed value, the transition with its falling edge suspending in its task, then the cue re-render with the committed value, no fallback, previous text retained; release: promotion, then the falling edge with the new text |
| `dispatch` | `setValue((v) => v + 1)` outside any transition | exactly one render |
| `bail` | `setValue(same)` on an idle cell | no render at all |
| `click` | a native `button.click()` whose delegated handler dispatches a functional update | exactly one render through the discrete-event flush |
| `urgent` | `start(() => setChild(next)); setParent(next)` in the same tick | parent renders once; the child renders its committed value under the urgent parent render, then the transition value with the falling edge |

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
cheapest cycles. `code_minified` is the compiled fixture; `bundle_minified` and
`bundle_gzip` include the tree-shaken runtime.

A separate native-operation census wraps `Map.prototype.get` only during each
untimed observed drive phase and restores it in `finally`. `<scenario>_map_gets`
counts the complete workload, including happy-dom, fixture, and harness calls;
it is not attributed to runtime source. Mount and unmount are outside this
census, and the creation observer adds no Map lookups. The clean run uses the
original native method and must produce the same semantics. Clean timings run
before any native-method override, since restoration alone need not restore
the engine's optimization assumptions.

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

## Staged-update lookup reuse

Returning the staged update record directly avoids looking it up again. Against
`613508303`, on Node 26.4.0 with esbuild 0.28.1, the unchanged fixture and
dependencies produced these native `Map.get` counts per 64 cycles:

| Scenario | `613508303` | Record reuse |
| --- | ---: | ---: |
| `cycle` | 832 | 768 |
| `updater` | 832 | 768 |
| `held` | 1,793 | 1,729 |
| `urgent` | 1,536 | 1,472 |
| `dispatch` | 256 | 256 |
| `bail` | 0 | 0 |
| `click` | 3,392 | 3,392 |

Each scenario that stages one update removes exactly one lookup per cycle.
The ordinary-update controls, every existing source creation counter, and
every semantic observation are unchanged. The compiled fixture remains 3,368
minified bytes; the complete minified bundle falls from 203,020 to 203,005 bytes
(−15 bytes), while gzip changes from 64,354 to 64,355 bytes (+1 byte).

The seven new lookup ceilings supplement the 35 existing work guards. The
unmodified baseline breaches the four staged-update lookup ceilings while
passing all existing guards and the three new controls; record reuse passes
all 42. These counts establish removed lookup work, without making an
allocation or application-latency claim.

Historical quiet A/B/B/A timings against `eff02711b`, before the compiler and
SSR changes in `613508303`, used the Node/happy-dom settings above. The
functional-updater timings and unchanged native-click control were:

| Order | Runtime | Updater mean (µs) | Updater median (µs) | Click mean (µs) |
| --- | --- | ---: | ---: | ---: |
| A1 | `eff02711b` | 1.753 | 1.583 | 5.821 |
| B1 | Record reuse on `eff02711b` | 2.041 | 1.967 | 7.701 |
| B2 | Record reuse on `eff02711b` | 1.674 | 1.562 | 5.813 |
| A2 | `eff02711b` | 1.648 | 1.555 | 5.607 |

All four runs passed the semantic controls and reproduced the deterministic
counter results. The first candidate run was slower, including the unchanged
click control; the other candidate run was much closer to the baseline.
The variability prevents attributing elapsed-time differences to this change.
No elapsed-time improvement is established; the supported result is the removed
lookup per staged update with unchanged creation counts. The `613508303`
revalidation repeated the deterministic counters and byte measurements, without
claiming those historical timings describe the newer base.

## October 2026 breach recovery

On 2026-10-02 main breached four guards: `cycle_runtime_functions` (193),
`updater_runtime_functions` (128), `click_runtime_functions` (64), and
`click_runtime_objects` (257). The weekly job had failed before its ratio step
since late August, so CI never reported them. Per-site attribution, which maps
each creation event through the source map to its `runtime.ts` line, and
`git bisect` over this runner's output found two causes:

| Counter | First bad commit | Site | Disposition |
| --- | --- | --- | --- |
| functions, every transition | `5ead1ff2c` (#1069) | `setNativeCandidateResolver(() => …)` in `runTransition`, plus one lazily registered Action resolver | Fixed: module functions that read the active batch |
| functions, every delegated click | `5ead1ff2c` (#1069) | `invoke` closure in `fireEventSlot` | Fixed: the closure exists only when a handler enters another signal owner |
| objects, once per run | `8a45222ab` (#1068) | first `DelegatedEventFrame` in the dispatch frame pool | Work model: one-time allowance |

The frame pool replaced Symbol-keyed properties that every dispatch added to
and deleted from the native Event. It allocates one frame per nesting depth on
the first dispatch and reuses it afterwards, so `click_runtime_objects` now has
a one-time allowance of 1. Its per-cycle budget is unchanged at 4. After the
fix, every counter matches the work model again. `held` and `urgent` each
create 64 fewer functions as well, because they run the same transition path.
The root-render transaction cost that #833 added to `hook-memo` is not involved
here, since every cycle in this suite is a hook update.

## Pending cue apart from its transition (#1864)

In `cycle`, `updater`, and `held`, one component raises `isPending` and holds the
state its transition sets. That component used to render the cue and the new value
together in the click's microtask flush. It now renders the cue with the committed
value, as React renders `isPending` urgently, and the transition's own render waits
for its posted task. `urgent` already rendered its child's cue apart from the
transition; that transition now also waits for the task. Creation events per 64
cycles against `823e100dd`, with every semantic control updated to the new order:

| Scenario | Counter | `823e100dd` | Split cue |
| --- | --- | ---: | ---: |
| `cycle` | renders | 128 | 192 |
| `cycle` | functions / arrays / objects / constructors | 128 / 1,728 / 707 / 192 | 256 / 2,624 / 1,155 / 320 |
| `updater` | renders | 128 | 192 |
| `updater` | functions / arrays / objects / constructors | 64 / 1,728 / 704 / 192 | 192 / 2,624 / 1,152 / 320 |
| `held` | renders | 256 | 320 |
| `held` | functions / arrays / objects / constructors | 640 / 4,480 / 1,344 / 834 | 768 / 5,376 / 1,664 / 962 |
| `urgent` | functions / arrays / objects / constructors | 192 / 1,984 / 1,088 / 256 | 256 / 2,688 / 1,280 / 320 |

The extra render is the cue's own. A render of this component costs 11 arrays,
4 objects, and 1 constructor (`dispatch`). The rest is the transition's posted task
and its separate flush: the task closure and its `MessageChannel`, and the follow-up
list for the falling edge. The cue's committed-cell exposure no longer allocates a
slot index or a predicate closure. React renders this pattern twice, folding the
falling edge into the transition render; the next section does the same.

## Falling edge in the transition's render (#1864)

React's transition lane carries `setPending(false)`, so `isPending` falls in the
render that commits the transition's own updates. Octane used to publish it from a
follow-up after the transition's task flush, a separate render and commit in the
same task. Its completion now settles in the drain that renders the transition's
work: the component holding the transition's state renders the new value with
`isPending` false, and a suspending render that holds the transition raises it
again. Creation events per 64 cycles against `385d6aba9`, with the `cycle`,
`updater`, `held`, and `urgent` controls updated to the new sequences:

| Scenario | Counter | `385d6aba9` | Falling edge folded |
| --- | --- | ---: | ---: |
| `cycle` | renders | 192 | 128 |
| `cycle` | functions / arrays / objects / constructors | 256 / 2,624 / 1,155 / 320 | 192 / 1,792 / 899 / 256 |
| `cycle` | map gets | 896 | 640 |
| `updater` | renders | 192 | 128 |
| `updater` | functions / arrays / objects / constructors | 192 / 2,624 / 1,152 / 320 | 128 / 1,792 / 896 / 256 |
| `updater` | map gets | 896 | 640 |
| `held` | renders | 320 | 320 |
| `held` | functions / arrays / objects / constructors | 768 / 5,376 / 1,664 / 962 | 704 / 5,376 / 1,728 / 962 |
| `urgent` | renders | 256 | 192 |
| `urgent` | functions / arrays / objects / constructors | 256 / 2,688 / 1,280 / 320 | 192 / 1,856 / 1,024 / 256 |
| `urgent` | map gets | 960 | 704 |

`cycle`, `updater`, and `urgent` each drop the falling edge's render (11 arrays,
4 objects, and 1 constructor here), its follow-up closure, and the follow-up list.
`held` keeps five renders: its suspended attempt now shows the falling edge, so the
journal snapshots one more binding bag before the hold restores it (+1 object), and
promotion still renders before the falling edge that the boundary's release
publishes. The bundle grows from 255,404 to 256,841 minified bytes (81,562 to
82,090 gzip): the completion queue, its hold cancellation, and the effect ordering
that commits a falling edge rendered after its drain's holds as the transition's
first update.

# Compiler output audit

This audit addresses all four Compiler output entries in
[issue #981](https://github.com/octanejs/octane/issues/981). The comparison source
is frozen at `68d1ea120`, after the SSR bookkeeping changes. The PR also includes
the subsequent `254024915` base update, which changes the Jotai binding.

## Results and retained cases

| Entry | Change | Cases retained after review |
| --- | --- | --- |
| Multi-statement handlers | Lift native block arrows with one or two immutable captures; reuse fixed-field descriptors on updates. | Mutable or larger environments, opaque scopes, shared native event slots, and special compiler modes retain closures. |
| Conditional capture arrays | Build arrays only for present arms; forward an identical immutable parent tuple into a nested arm. | Different layouts, local shadows, and observable tuple escapes retain independent arrays. |
| SSR wrappers and lists | Inline a sole eligible attribute; move key evaluators outside item loops; invoke compiled item bodies through `ssrForItem`. | Multiple attribute evaluations, spreads, form channels, and iterator snapshots retain their ordering frames. |
| `useState` argument-count check | Audited the real runtime with an experimental stripped control. | Keep the current entry: removing the check breaks manual calls, and the experiment established no timing benefit to pay for another ABI. |

Detailed contracts, workload definitions, before/after measurements, controls,
mutation checks, and limitations are in [handlers.md](handlers.md),
[branch-environments.md](branch-environments.md), [server.md](server.md), and
[state-arity.md](state-arity.md).

The reliable improvements are deterministic source work: the handler workload
eliminates 256 native slot writes over 128 updates, absent branches eliminate
128 reached array literals, identical nested environments halve their arrays,
and the SSR workload removes two arrow expressions from each of 1,000 item
iterations. These counts are not measurements of heap allocations. Browser and
server timing did not establish an application latency improvement.

## Cost and lifecycle

The event helpers reuse descriptor fields, update journaling, dispatch snapshots,
and unmount cleanup. One module function per eligible handler retains no
component values; the mounted descriptor owns its current captures. Conditional
environment changes introduce no cache or runtime helper. `ssrForItem` restores
the async identity in `finally`, including when a body suspends or throws.

Specialized runtime support has a bundle cost. The measured event application
adds 116–131 gzip bytes, an ordinary bundled event control adds 23 gzip bytes,
and the server fixture adds 36 gzip bytes. Branch guards also add emitted bytes.
This PR trades these small startup costs for avoided repeated work; it does not
claim an overall bundle reduction.

The unchanged sixteen-file codegen corpus, compiled with Node 24.20.0 and the
same source paths/options on both revisions, gives these totals:

| Mode | Raw bytes, baseline → candidate | Minified bytes | Sum of module gzip bytes |
| --- | ---: | ---: | ---: |
| Client | 179,763 → 180,165 | 86,030 → 86,129 | 30,050 → 30,090 |
| Server | 96,938 → 96,101 | 54,959 → 54,620 | 18,081 → 18,106 |

These module totals exclude runtime helper implementations; the complete bundle
costs above account for those separately.

Compiler throughput remains inconclusive. A quiet Node 24.20.0 A–B–B–A run of
the sixteen-source production client corpus measured batch medians of 154.64,
146.74, 168.89, and 147.21 ms. The mean candidate batch median was 4.6% higher,
but its repeated batches differed by 15.1% and the individual sample ranges
overlapped. No compiler throughput improvement or reliable regression is claimed.
The new event-capture analysis is skipped entirely in HMR, profiling, and native
read modes, where handler lifting is disabled. Production still pays for the
capture safety checks, including the branch argument-escape proof.

## Empty arms in native-read modules

A module that imports `octane/signals` brackets each compiled block body with
`beginNativeReadScope`/`endNativeReadScope`. An empty `@if`/`@else` arm has no
code that can read, but it still entered and published an empty read scope on
every render; a production application bundle carried six such bodies.
`native-read-scopes.mjs` compiles three modules and runs them through public
roots for 64 cycles. Each cycle updates a signal read by the non-empty arm,
renders the other arm twice, and switches back, asserting the visible text at
each step.

| Module | Scope sites | Empty brackets | Scope entries (64 cycles) | Minified bytes |
| --- | ---: | ---: | ---: | ---: |
| Empty `then` arm, baseline `e99af7160` → candidate | 3 → 2 | 1 → 0 | 448 → 320 | 833 → 811 |
| Empty `else` arm, baseline → candidate | 3 → 2 | 1 → 0 | 448 → 320 | 833 → 811 |
| Two rendering arms (control) | 3 → 3 | 0 → 0 | 448 → 448 | 959 → 959 |

Module activation still calls `enableNativeReadCollection`, so dropping the
bracket around an empty body skips no driver setup. Ratio guards hold
`empty_brackets` at zero for both empty-arm modules.

## Reproduce

Use Node 24 and the repository lockfile dependencies:

```sh
bun run bench:all compiler-output --quick --ratios
node benchmarks/compiler-output/corpus.mjs /path/to/frozen/baseline
node benchmarks/compiler-output/state-arity.mjs /path/to/frozen/baseline
node --jitless benchmarks/compiler-output/state-arity.mjs /path/to/frozen/baseline
```

The unified suite enforces sixteen work ratios, including controls that preserve
required arrays and larger handler closures. Its browser scenario uses real
native events and verifies current values, cancellation, and survivor identity.
The server report verifies the complete response hash, key/body counts, and row
ordering. `corpus.mjs` compares the same fixed codegen corpus in client and
server modes; optional `--timing` runs alternating compiler timing batches.

Correctness coverage includes development and production, hydration adoption,
keyed survivors, nested dispatch, suspended transaction rollback, attribute
coercion order, iterator mutation, async SSR retries, scoped classes, argument
escapes, and frozen parser ASTs. Deliberate event, condition, attribute, and item
argument mutations failed their intended tests before being restored. Additional
review reproduced and fixed local class/enum scope capture, native event alias
ordering, and nested tuple aliasing.

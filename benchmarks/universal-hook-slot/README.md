# Universal hook slot work

This untimed Node benchmark exercises the production universal runtime through
public object-driver roots. One and 128 keyed child owners each call state, ref,
memo, and layout-effect hooks at two independent sites. The nested case uses two
`withSlot` levels; the direct-hook case is a negative control.

The guard measures source array-creation events during mount, changed-prop
updates, state updates, keyed reorder, and unmount. It also records module
initialization and fixture setup. Each render of 128 owners calls 1,024 hooks.
The default gate requires zero arrays from hook-slot resolution in every phase.

```bash
node benchmarks/universal-hook-slot/run.mjs

# Compare the current resolver with an earlier Git revision using the same
# dependencies, bundler options, fixture, and other runtime modules.
BENCH_JSON=/tmp/universal-hook-slot.json \
  node benchmarks/universal-hook-slot/run.mjs 621147d01

# Record an unoptimized baseline without enforcing the zero-array gate.
BENCH_SOURCE_REF=621147d01 \
  node benchmarks/universal-hook-slot/run.mjs --measure
```

Remove `--measure` from the last command to verify the baseline fails the guard.
`BENCH_SOURCE_REF` and the comparison argument replace only
`packages/octane/src/universal-core.ts` from the requested Git object; they are
for isolated changes to that file. All other sources come from the worktree.

## Measurement boundary

The runner bundles the real universal entry with esbuild and
`NODE_ENV=production`, then applies the existing allocation observer to emitted
JavaScript. This keeps instrumentation out of tree shaking and runtime build
decisions. The observer counts executed array literals, `new Array`, and rest
parameters. It reports both resolver-local events and events across the bundled
runtime. A paired run requires the total decrease to equal the resolver decrease
in every phase, with module initialization unchanged.

These are source creation counts, not retained heap bytes, garbage collections,
or an elapsed-time speedup. Engine escape analysis may remove some temporary
arrays. Arrays created inside built-in methods are not counted. Fixture-authored
arrays and observer overhead are excluded. The benchmark makes no DOM, browser,
native-device, SSR, or application-throughput claim.

Both clean and observed bundles must produce the same output hash. Each phase
checks independent state, live state getters, stable refs and setters, memo
values, retained host identities, keyed order, and effect setup/cleanup. Ordinary
prop and state updates must emit no structural host commands. Direct and nested
cases must produce identical visible output and lifecycle counts.

## Recorded comparison

Against `621147d01` on Node 26.4.0 / V8 14.6.202.34-node.21, each render phase
for 128 nested owners removes 1,024 resolver array events:

| Phase | Baseline runtime arrays | Indexed traversal runtime arrays |
| --- | ---: | ---: |
| Mount | 4,543 | 3,519 |
| Changed props | 3,510 | 2,486 |
| State update | 3,383 | 2,359 |
| Keyed reorder | 3,899 | 2,875 |

The one-owner nested case removes eight events in each phase. Direct hooks
remain at zero resolver arrays; all their runtime counts are unchanged. Module
initialization (130), fixture setup (nine), and 128-owner unmount (403) are also
unchanged. Every 128-owner render still calls 1,024 hooks, and all 256 effects
clean up. JSON output includes source, emitted helper, bundle, and lockfile hashes.

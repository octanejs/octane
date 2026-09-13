# Generic record snapshots

## Contract and remaining call sites

`journalObjectOnce` snapshots an object's own enumerable values once per open
checkpoint. Rollback removes speculative enumerable additions, restores deleted
and changed values, and restores an array's saved length. Getters are evaluated
by the spread snapshot; restoration invokes setters. Non-enumerable state and
inherited state remain outside this value snapshot.

The generic Map/checkpoint path serves spill `bagOf` bindings and runtime record
families: structural root slots, controlled form state, effect slots, head slots,
handler bundles, dynamic host slots, try-boundary state, and deferred values.
Fixed-arity `bag0` through `bag16` already have branded, separate clone sites.
They remain on that existing path.

The spill helper accepts arbitrary keys and accessor properties, including
array-backed binding integrations. Adding a public string stamp or assuming one
fixed field layout would change that contract. Family-specific clone sites also
retain the same snapshots and their lifetimes; they cannot remove the values
needed for rollback.

## Measured split-site experiment: retained generic path

```sh
node benchmarks/root-transactions/bags.mjs
```

The script builds production code from a fixture with 24 button bindings, native
handler environments, a controlled input, a layout effect, and a trailing reader.
The experiment duplicates only the generic helper's spread site for spill bags,
leaving its Map/checkpoint guard, snapshot semantics, and rollback unchanged.
The authored runtime file is never changed by this experiment.

Node v24.20.0, Happy DOM, 256 warmup updates, 16 samples of 128 updates, A-B-B-A:

| Variant | First median/update | Second median/update |
| --- | ---: | ---: |
| Shared generic snapshot | 23.21 µs | 20.37 µs |
| Separate spill spread site | 20.24 µs | 20.75 µs |

The distributions drift and overlap. Splitting does not show a reliable benefit
and adds **115 minified bytes / 44 gzip bytes** to this workload. The shared
snapshot implementation is retained. This is an interpreter/DOM-model timing
sample, not a browser latency or heap allocation measurement.

Every run checks button identity, final text/title, the accepted native handler
value, controlled input value, layout-effect value, and matching teardown. Clean
bundles are used for timing; there are no per-operation observer callbacks.

## Symbol restoration defect fixed during the audit

The previous spread captured enumerable symbols, but the rollback loops used
`Object.keys`, so their saved values were never restored. A held root could show
accepted DOM while an existing native handler read candidate symbol values.
Rollback now considers both string and symbol keys. Enumerability filtering
keeps hidden fields outside the snapshot.

An adversarial check caught a second edge: blindly assigning the newly reached
symbols throws for unchanged read-only symbols. Symbol writes use `Reflect.set`
so accessor setters still run. A failed write is accepted only when the current
value matches the snapshot with `Object.is`; this includes a constant `NaN`.
Otherwise ordinary assignment retains the native failure for an unrestorable
value. String assignment behavior is unchanged. No property-descriptor objects
or new write-path state are introduced.

The same harness compares final rollback against an in-memory build of the old
string-only loops, using ordinary compiler-owned records for which both produce
the same result. It performs 256 warmup holds and 16 samples of 128 holds:

| Rollback variant | First median/hold | Second median/hold |
| --- | ---: | ---: |
| Previous string-only loops | 63.06 µs | 66.40 µs |
| Complete symbol restoration | 69.89 µs | 68.36 µs |

The final implementation adds **127 minified bytes / 57 gzip bytes** relative to
that otherwise identical build. Complete restoration is slower in these batch
medians, with overlapping sample ranges; there is no rollback speedup claim.
Extra symbol handling occurs on rollback,
with no additional ordinary snapshot work. The old loops are an invalid general
replacement because the symbol regression fails there.

## Correctness evidence

`packages/octane/tests/root-snapshot-values.test.ts` uses the exported compiler
ABI and observes accepted binding values through retained native buttons.

- Pre-fix symbol case failed in both `octane` and `octane-prod` projects: the event read
  `candidate::candidate` instead of accepted `initial:kept:absent`.
- Blind symbol assignment failed both projects on an unchanged enumerable read-only
  symbol containing `NaN`; the final implementation preserves it.
- Final four cases pass in both projects: symbol additions/deletions/changes and
  repeated holds, string accessors, symbol accessors, and array contents/length.
- An isolated build mutation that removed value restoration failed all eight
  executions, including the accessor and array controls.
- Seventy-two final root suspension/rollback executions passed, including all
  four new cases in both projects after the read-only-symbol guard.

These are value snapshots, not descriptor snapshots: changing property
writability/configurability during speculative execution is not made reversible.

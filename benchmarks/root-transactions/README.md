# Root transaction audit

This audit revisits all five remaining Root transactions entries in
[issue #981](https://github.com/octanejs/octane/issues/981), against
`ade5be8624ed92a7c1cc4bd94f87a899fee10c9f`.

| Entry | Result | Retained work |
| --- | --- | --- |
| Nullable transaction driver | Reproduced incorrect held output when arming waits until the first raw thenable. | Arm before user render code so the first suspension can restore preceding writes. |
| Generic object snapshots | Restore enumerable symbol values, additions, and removals correctly. | Keep the shared generic snapshot path; splitting its call sites showed no reliable timing benefit. |
| Live DOM reads | Reuse the value already read by descriptor text comparison. | Compiled text and attributes still read the immediately preceding live value, including external edits and attribute absence. |
| Removed keyed rows | Replace each retirement undo closure with a flat journal record. | Keep the retirement Set, eager exact node arrays, connected cleanup, and the bulk-clear path's single batched record. |
| Property journal costs | Pair a survivor's previous item and captures in one record. | Other scalar fields retain their existing journal entries and guards. |

The audit also reproduced and fixed a Suspense capture defect: a whole-origin
transition rollback restored state but left a boundary's candidate environment.
An urgent descendant could then retry against those stale inputs, delete a
retained keyed row, and lose its local state. Recording the previous boundary
environment before its nested window preserves both whole-attempt rollback and
the boundary's own retry inputs.

## Measurements

All comparisons use Node 24.20.0, identical source fixtures and build options.
These are deterministic operations or reached source expressions; they are not
heap allocation or application latency measurements.

| Workload | Baseline | Candidate |
| --- | ---: | ---: |
| Descriptor text reads, 128 changing updates | 256 | 128 |
| Retirement undo closures, remove 128 of 256 rows | 128 | 0 |
| Retirement undo closures, remove all 256 rows | 256 | 0 |
| Input journal slots, 256 rows changing items and captures | 2,048 | 1,024 |
| Input journal slots, only items or captures change | 1,024 | 1,024 |
| Input journal slots, neither changes | 0 | 0 |

See [contracts.md](contracts.md), [retirement.md](retirement.md),
[inputs.md](inputs.md), and [bags.md](bags.md) for contracts, exact baseline
commands, size costs, semantic controls, rejected alternatives, and limitations.
The combined runtime moves the retirement fixture from 167,598 to 167,846
minified bytes and 54,459 to 54,550 gzip bytes (+248/+91). The input fixture
moves from 169,625 to 169,873 minified bytes and 55,043 to 55,143 gzip bytes
(+248/+100). No overall size or latency improvement is claimed.

## Reproduce

```sh
pnpm bench:all root-transactions --quick --ratios
node benchmarks/root-transactions/retirement.mjs /path/to/baseline/runtime.ts
node benchmarks/root-transactions/inputs.mjs /path/to/baseline/runtime.ts
node benchmarks/root-transactions/contracts.mjs /path/to/baseline --reads-only
node benchmarks/root-transactions/bags.mjs
```

The unified suite enforces operation ratios with clean/observed output, native
event, node identity, and cleanup controls. The contract script additionally
requires its deliberately incorrect alternatives to fail their hold checks.

## Lifecycle and validation

The new opcodes use the existing four-slot log and its existing window lifetime.
They add no per-block fields, retained caches, or queues. Retirement retains the
same Set/Block references; input records retain the immediately preceding values
until rollback or commit clears the log. Symbol handling runs only in rollback.
The Suspense environment record is limited to changed inputs during a transition.
It adds four log slots per changed existing boundary in those attempts, paying
for restoration before urgent descendants retry.

Behavioral regressions exercise development and production, repeated holds,
native events, state updates, nested windows, retry, supersession, and hydration
with uncontrolled input preservation. Deliberately removing either input
restoration fails eight executions, swapping retirement record operands fails
four, and incorrect text or attribute rollback fails its intended regressions.
The original symbol and urgent-row regressions fail before their fixes.

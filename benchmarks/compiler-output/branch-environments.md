# Conditional branch environments

Issue [#981](https://github.com/octanejs/octane/issues/981), Compiler output:
`@if` eagerly builds captured-local arrays for absent branches and rebuilds an
identical array in nested branches.

## Contract and implementation

The condition runs once at its authored position. Selected branch setup,
current captures, local shadows, errors, keyed row identity, state, and hydration
adoption retain their behavior in development and production.

- A direct missing-arm `@if` saves the condition in a block-local temporary and
  builds the environment only when that arm is selected.
- Returned JSX fragments save the condition at its original hole-prop position;
  the later environment hole reads that temporary. Sibling evaluation order is
  unchanged.
- Nested `@if` calls forward the incoming tuple only when the ordered capture
  layout matches exactly and every incoming name is this helper's own immutable
  capture. A union-only name may be a local shadow and disqualifies forwarding.
  Authored `arguments` or direct `eval` anywhere in that helper subtree also
  disqualifies forwarding: either the parent or a child can expose and mutate
  the incoming tuple, so sibling environments must remain independent.
- No runtime helper, cache, retained allocation, or ABI is added. Two present
  arms, mismatched layouts, and local shadows retain required tuples. Activity
  behavior is unchanged. Server output does not use these client tuples.

## Reproduction

From the worktree, use the same Node executable for both runs:

```sh
node benchmarks/compiler-output/branch-environments.mjs /path/to/baseline
node benchmarks/compiler-output/branch-environments.mjs
```

The optional source directory must contain the baseline `packages/octane/src`
and its dependency links. `BENCH_JSON=/path/report.json` also writes the standard
suite/targets report used by the ratio runner. `OCTANE_BRANCH_COMPILER` can select
an isolated compiler module for mutation checks. Every report records source and
compiler SHA-256 hashes and the Node version.

The harness compiles six fixed sources with production options and bundles each
against the real runtime. It mounts, performs 128 public root updates, validates
final text and unmounting, and repeats with the existing application-code array
observer. Clean and observed output must agree. Counters report **reached array
literal sites**, not measured heap allocations. Size is taken from clean compiler
output; instrumented output is never used for size or timing.

## Baseline and candidate

Baseline: `68d1ea120`; baseline compiler SHA-256
`45a0c9026d30ba7760a82b7d69d1d349f07ef9c689fd541f2a01295f0ddc81e8`.
Final comparison: macOS arm64, Node **24.20.0**, esbuild from the unchanged lockfile.
Initial Node 26.4.0 counters were identical; the table uses the Node 24 rerun for
both sides because compressed bytes differ across Node/zlib versions.

| Scenario | Active arrays, baseline → candidate | Absent arrays, baseline → candidate | Minified bytes | Gzip bytes |
| --- | ---: | ---: | ---: | ---: |
| Direct single arm | 128 → 128 | 128 → 0 | 525 → 546 | 330 → 337 |
| Returned fragment | 128 → 128 | 128 → 0 | 616 → 633 | 393 → 400 |
| Nested identical layout | 256 → 128 | 128 → 0 | 689 → 708 | 369 → 378 |
| Two present arms control | 128 → 128 | 128 → 128 | 695 → 695 | 350 → 350 |
| Local-shadow control | 256 → 256 | 128 → 128 | 884 → 905 | 416 → 428 |
| Escaping arguments control | 256 → 256 | 128 → 0 | 764 → 806 | 417 → 425 |

The controls make the improvement disappear when the arrays carry required data.
The local-shadow source still gains a missing-arm guard for its inner branch,
but this drive keeps that inner branch active, so its reached arrays stay equal.

## Correctness and self-review

`packages/octane/tests/branch-captures.test.ts` covers condition evaluation,
current event captures, nested state across updates and removal, local shadows,
keyed reorder identity, throwing conditions on client/server, and hydration
adoption from development/production server output into both client modes.
Additional cases mutate escaped parent and child argument arrays, and do so
through direct eval, while asserting the rendered capture values stay correct.

The initial Node 24 run passed **166 tests / 9 project files**: branch
captures, JSX return branches, conditional hooks, compiler map coverage, template
origins, and frozen-AST compilation. Deliberately evaluating the direct condition
twice made the direct and else-only consumer tests fail in both client modes
(four failures: the expected button was absent); the mutation was restored before
the final run.

Adversarial review then reproduced an argument-aliasing regression against the
frozen compiler: mutating the outer argument tuple changed a nested branch from
`original` to `mutated`. The three permanent regression cases failed in both
client modes before the escape guard (six failures). After the guard, **92 tests
/ 4 project files** passed for branch captures, source maps, and frozen-AST
compilation, and all six final benchmark controls passed. The escaping-arguments
control mutates the received arrays and confirms the expected nested output.

Review rejected forwarding layouts by name-set alone: positional tuple ordering
and local shadowing must also be proven. Environment metadata is passed through
this helper's compile options rather than mutable inherited compiler context, so
nested generated functions cannot accidentally borrow an unrelated tuple.

## Limits

The saved condition adds a small branch and 17–21 minified bytes to the measured
single-arm cases. This trades shipped bytes for avoided source-level allocation
work; no application latency or garbage-collection improvement is claimed. Cases
with different capture layouts retain their arrays. Broad browser timing remains
a separate measurement.

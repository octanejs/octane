# Client and server runtime micro-optimization pass

Baseline: upstream `733c98d57b76fcfbc8f1272cc1e202582f4bedfd`.

This pass examines repeated work in the DOM client and server runtime: temporary
arrays and records, callback creation, property shapes, and loop overhead.
It preserves public output, DOM identity, hydration adoption, lifecycle order,
error recovery, and request isolation. The universal renderer and compiler are
outside this pass's implementation scope.

## Selection

| Area | Change | Contract to protect |
| --- | --- | --- |
| Server styles | Skip replacing an identical CSS/nonce entry | Changed CSS and nonces still win; insertion order, request isolation, and replay remain correct |
| Client descriptor children | Return before flattening an empty value into an empty host | Existing owned children still clear; foreign DOM and hydrated nodes keep their ownership rules |
| Passive effects | Reuse the callback scheduled after paint | Cancellation, later rearming, cleanup, and effects queued during a drain remain correct |

All three changes are retained after baseline/candidate work controls. The server
style case additionally demonstrates a focused timing improvement; neither client
change establishes an application latency improvement.

## Designs retained

- Hook storage remains a lazy `Map`. Compiler numeric slots occupy globally
  reserved ranges; symbols, composed hooks, rollback, and HMR share the same
  authority. A direct array replacement needs a different ABI and lifetime design.
- `resolveHookArgs` retains its returned tuple pending evidence that removing it
  pays for duplicated hook argument handling. Source-level tuple creation alone
  does not establish a heap allocation in optimized machine code.
- Iteration snapshots and `withSlot` rest/spread retain observable iterator,
  getter, and render-time mutation semantics. Blanket loop rewrites would not
  preserve these contracts.
- Effect queues retain their existing draining and snapshot rules. Removing
  copies needs a separate reentrancy and speculative-capture analysis.
- Existing runtime record layouts and large rendering functions remain in place.
  Earlier shape and tiering audits already established useful changes and the
  limits of inferring performance from source structure.

Background evidence: [hooks runtime](../hooks-runtime/README.md),
[object shapes](../runtime-object-shapes/README.md),
[client functions](../client-hot-paths/functions.md), and
[SSR throughput](../ssr-throughput/README.md).

## Evidence interpretation

Observed source-operation and callback-identity counts establish work or object
identity removed from the executed path. They are not allocated-byte or GC
measurements. Clean production bundles own timing. Samples inside observed
variance are inconclusive, and focused fixtures do not establish an overall
application speedup.

## Measured work

| Workload | Baseline | Candidate |
| --- | ---: | ---: |
| 512 empty descriptor hosts, mount or update | 1,024 child scratch-array expressions | 0 |
| 128 passive-effect batches | 128 callback identities / 128 scheduling calls | 1 callback identity / 128 scheduling calls |
| 128 identical server component styles | 128 style records / 127 replay copies | 1 style record / 1 replay copy |
| 32 existing styles followed by 128 identical styles | 4,223 replay entries copied | 65 replay entries copied |

The client empty-host run used production Chromium and four alternating
baseline/candidate pairs. Median-of-run medians were 0.0825 → 0.0825 ms for 128
hosts and 0.3185 → 0.3245 ms for 512 hosts. Populated controls also varied; the
ranges overlap, so these timings establish no improvement or regression.

The populated server-style workload (32 existing sheets plus 128 repeated styled
components) improved from 0.2830 → 0.0928 ms in the first process and
0.3276 → 0.1089 ms in the confirmation process: about 67% lower response time.
Each process alternated 31 baseline/candidate samples after warmup; their ranges
did not overlap. The unique/changed-style controls had overlapping ranges and
show no established improvement or regression. This is a focused fixture result,
not a 67% claim for general SSR.

Passive-scheduler clean Node/happy-dom samples also overlap. The supported
result is one reused callback identity, with unchanged scheduling counts and
effect/cleanup behavior. The benchmark drains effects inline; scheduled
post-paint delivery is covered separately by the behavioral tests.

See the self-contained experiment records for commands, controls, raw samples,
source/bundle hashes, and size costs:

- [Empty descriptor hosts](../empty-host-children/README.md)
- [Passive scheduling](../passive-scheduling/README.md)
- [Repeated server styles](../runtime-style-dedup/README.md)

## Review and limitations

The empty-host return is placed after the existing scalar-text update path, so
that established path pays no added condition. Hosts with existing DOM retain
ownership scans and removal/rollback. Arrays remain on the full traversal path.
The passive callback clears its scheduling flag before the drain, allowing
reentrant scheduling. The style check compares both CSS and nonce, retains
changed-write invalidation, and introduces no cache or extended lifetime.

This pass does not rewrite public iteration semantics, change hidden-class
layouts, or alter compiler output. Memory/GC bytes, additional JS engines,
application-level SSR throughput, and browser paint were not measured.

## Validation

- Production benchmark runner: all 27 new ratio guards pass. Running the same
  suites against the frozen upstream runtime fails exactly the 12 guards for
  the original repeated work; populated and unchanged-dependency controls pass.
- Runtime types: `pnpm exec tsgo --noEmit -p packages/octane/tsconfig.json` passes.
- Broader runtime tests: 75 test files in both `octane` and `octane-prod`,
  covering descriptor children/refs, effects, server rendering/streaming,
  scoped styles, and the complete top-level hydration directory. All 1,616 tests
  pass across 150 project-file executions with the normal root compiler flags
  and four workers. An initial isolated-config discrepancy and a separate
  existing compiler finding are documented below.
- Deliberate negative controls: skipping populated-host clearing fails all six
  new client cases; resetting the passive scheduling flag after draining loses
  the second root's effect in both compile modes; ignoring nonce differences
  fails four server cases; skipping changed-style replay invalidation fails two.
  All temporary mutations were restored and their targeted suites passed again.
- Scoped changed-fixture typechecking retains 20 pre-existing errors in
  `effect-timing.tsrx`; byte-exact baseline and candidate fixture diagnostics
  match. The new cleanup returns `void` and adds no type errors.
- Changed source, tests, benchmark scripts/data and ratio registration pass the
  scoped formatting check and `git diff --check`.

### Local environment

The full workspace install encountered a registry 403 on unrelated
`@ripple-ts/adapter`. Runtime validation uses the frozen lockfile with
`pnpm --filter octane --filter octane-monorepo install --frozen-lockfile --ignore-scripts`.
The normal root Vitest config imports uninstalled unrelated packages, so the
local config in `node_modules/runtime-pass.vitest.config.mjs` contains the
verbatim `octane` and `octane-prod` project objects from `vitest.config.js`,
including their plugins, exclusions, global setup, and per-test setup. It also
sets the root config's process-wide `OCTANE_COMPILE_FROZEN_AST=1` and
`OCTANE_COMPILE_ASSERT_LOC=1` flags, which apply to fixture compilation in the
main Vitest process. No runtime mocks or behavior overrides were added to the
candidate test run. The separate baseline diagnostic replaces only the two
runtime source files before transform. The recorded local validation did not
include full monorepo test/typecheck or remote CI.

Re-run the performance guards with:

```sh
PASSIVE_TIMING=0 node benchmarks/bench.mjs --quick --ratios \
  runtime-style-dedup empty-host-children passive-scheduling
```

### Existing compiler finding

The initial isolated Vitest config omitted the root config's two process-wide
compiler flags. That run passed 1,614 tests and failed the same deferred-hydration
style assertion in both compile modes; loading both runtime files from the
frozen baseline reproduced the failures. Restoring the normal root flags makes
the complete deferred-hydration suite pass (46 tests), without runtime, compiler,
or test changes.

Direct compilation with mutable parser ASTs still reproduces an existing
compiler defect on both baseline and candidate source: server compilation emits
`.styled-complete-note.tsrx-H`, while the extracted `?octane-hydrate=1` client
chunk emits `.tsrx-H .styled-complete-note`. Inspection of
`prepareHydrateBoundaries` finds CSS class-selector offsets of 1,304/1,652 against
a 72-character stylesheet. The likely location is `inheritGeneratedOrigin` in
`packages/octane/src/compiler/hydrate-boundaries.js`, which appears to stamp
module-origin positions onto mutable CSS descendants that need CSS-relative
coordinates. Frozen parser nodes skip that stamping. The CSS parser's required
JS dependencies are installed; this is not an install-script fallback. This pass
records the separate compiler finding without changing compiler behavior.

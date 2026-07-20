# Causal state-model policy decision

> **Status: DECIDED.** Recorded 2026-07-19 as the public policy companion to
> [`strict-state-plan.md`](./strict-state-plan.md). This document fixes the
> configuration vocabulary, package boundary, authorization model, provenance
> contract, and rollout order.
>
> **Current rollout:** selecting `causal` hard-enforces component render and
> runtime-owned purity frames. Effect setup/cleanup and other commit callbacks
> remain runtime-permissive, with statically proven writes reported as warnings,
> until the replacement primitives, lifecycle guard, and Callback Provenance
> phases land. The lifecycle rules below describe the permanent target semantics,
> not enforcement shipped in the foundation release.

## 1. Decision

The public field is `stateModel`. Its values are:

- `causal`: authored state transitions occur at causal boundaries. Render and
  synchronous lifecycle work are read-only.
- `permissive`: retain the existing render replay and lifecycle-update behavior as
  an explicit migration boundary.

The native configuration after rollout is:

```ts
export default defineConfig({
	compiler: {
		stateModel: {
			default: 'causal',
			packages: {
				'@vendor/legacy-widgets': 'permissive',
			},
		},
	},
});
```

The first rollout release uses the same permanent shape with
`default: 'permissive'`. The default flips only after policy plumbing,
diagnostics, callback provenance, replacement primitives, inventory, and
first-party migrations are ready. This is not a boolean feature flag that
disappears after migration.

Package manifests use the same noun and values:

```json
{
	"octane": {
		"stateModel": "permissive"
	}
}
```

The post-rollout documentation headline is:

> Octane uses the causal state model. Permissive state behavior exists only as an
> explicit migration boundary.

## 2. What `stateModel` controls

`stateModel` is intentionally narrow. It selects the phase legality of authored
state transitions and whether render-phase updates use the existing replay path.
It does not select storage, equality, batching, priority, hook tuple shape,
external-store semantics, or every scheduler behavior.

Under `causal`, a user-callable setter or dispatcher is rejected while any of
these frames is synchronously active:

- component render;
- state or reducer initialization;
- memo factory evaluation;
- reducer or functional-updater evaluation;
- insertion, layout, or passive effect setup;
- effect cleanup; or
- any other commit callback classified as lifecycle work.

Within one authored definition boundary, the entire active frame chain is
checked: **any forbidden ancestor wins**. A nested action, transition, helper,
or event-shaped function cannot hide the enclosing render or lifecycle frame.
A separately compiled component or custom-hook definition establishes a new
executing-source boundary, however: package policy is non-transitive, so an
approved permissive definition updating its own permissive cell retains the
existing behavior even when a causal caller is rendering it. The target-cell
half of the rule still prevents that boundary from weakening a causal cell.

`useCallback` declaration is legal because it does not execute the callback. A
callback statically proven to execute synchronously from a forbidden frame is
illegal, including both of these forms:

```ts
useEffect(callback);
useEffect(() => callback());
```

A timer, observer notification, subscription notification, async continuation,
or deliberate deferral that runs after the forbidden stack has returned is a
legal causal transition. A subscription callback replayed before effect setup
returns is still in the forbidden frame and is rejected.

The guard runs before functional updater evaluation and before same-value eager
bailout. Runtime-internal scheduling is not routed through the authored-dispatch
guard.

## 3. Package resolution and authorization

The initial granularity is one exact package:

- `packages` keys are exact npm package names. There are no filesystem globs,
  source paths, export subpaths, component wrappers, inline pragmas, or per-call
  suppressions.
- The application package cannot appear in `packages`, even with the same model as
  `default`. Its model comes only from `default`.
- A nested workspace package with its own manifest is a separate package even when
  it lives beneath the application root.
- Policy is non-transitive. A dependency's model does not flow into its callers,
  children, callbacks, or unrelated dependencies.
- The existing compiler `exclude` option remains an ownership escape for source
  routed through another TSRX toolchain and for permissive plain helpers. Excluded
  output carries no Octane state-model ABI, so `exclude` cannot downgrade an
  otherwise Octane-owned causal `.ts`/`.js` helper. Such a conflict is a build
  error; third-party compatibility belongs in the exact package map instead.

Authorization is declaration plus consumer approval:

1. A dependency manifest declaring `stateModel: 'causal'` is accepted without a
   separate approval.
2. A dependency manifest declaring `stateModel: 'permissive'` requires an exact
   `packages` entry selecting `permissive`. Without it, the build fails and prints
   the precise approval entry.
3. A consumer may explicitly classify a dependency with no declaration as
   `permissive`. This supports source packages published before the field exists.
4. A dependency with neither a declaration nor an exact package entry inherits
   the project `default`.

An exact package entry may select either model and takes precedence over a causal
declaration or the project default. A permissive declaration is the exception: it
must have a matching permissive entry, so a contradictory causal entry fails
rather than silently relabeling the package.

An ordinary state diagnostic never recommends changing the project default or
adding a permissive package entry. The approval suggestion appears only when a
dependency has declared that requirement. This keeps migration authorization
separate from the repair path for application code.

The compiler extends the watched nearest-manifest resolver in
[`bundler.js`](../packages/octane/src/compiler/bundler.js). It does not infer
package identity from `node_modules` paths, which vary across package managers,
workspaces, and symlinks.

## 4. Two-sided provenance

The state model belongs to both sides of a transition:

- the executing source keeps the model of the package that authored it; and
- each hook cell keeps the model of the package that allocated it.

During a forbidden phase, the final composition rule is:

| Executing source | Causal cell | Permissive cell |
| ---------------- | ----------- | --------------- |
| Causal           | Throw       | Throw           |
| Permissive       | Throw       | Existing behavior |

Outside a forbidden phase, ordinary updates remain legal in every combination.
The matrix closes both laundering directions: causal code cannot gain permission
by obtaining a permissive setter, and permissive code cannot lifecycle-update a
causal cell.

Runtime source provenance has a deliberate, honest boundary. The implemented
foundation knows the definition model at compiled component and custom-hook entry
points. That source model remains active through synchronous nested calls. The
compiler additionally follows local aliases and local call chains, so it can
reject a locally proven nested invocation before runtime.

Initializer, memo, reducer, and functional-updater callbacks currently inherit
the model of the hook invocation or cell whose runtime executes them. This makes
causal hooks pure now, but it is not yet callback-author provenance: a causal
callback handed to a permissive cell follows the permissive cell model, while a
permissive callback handed to a causal cell follows the causal cell model. A
versioned **Callback Provenance ABI** must brand callback definitions across
imports, returned functions, opaque setters, `.bind()`, and aggregate values
before the full matrix can be claimed. It is required before lifecycle writes
become errors or `causal` becomes the default. A partial call-site marker is
explicitly rejected because it would miss exactly the cross-package flows this
policy is meant to make auditable.

This design does not claim general dynamic attribution for arbitrary JavaScript
callbacks crossing opaque call sites. At such a site the compiler proves or stays
silent. The runtime still sees any active runtime-owned forbidden ancestor and the
target cell's model, but it cannot invent an author identity for an arbitrary
callback that no compiled or runtime-owned boundary identifies. This limitation is
tracked explicitly rather than hidden behind a claim of complete callback
provenance.

The implemented foundation activates exact source provenance for component render
and custom-hook boundaries, plus cell-owned enforcement for hook purity frames.
Effect-hook calls already accept the hidden model ABI argument, but the runtime
does not retain it on effect records yet. Effect setup/cleanup and other
commit-callback runtime frames remain deliberately unenforced until the lifecycle
and Callback Provenance phases; their statically proven writes are reported as
warnings meanwhile.

## 5. Distribution and auditability

- Full `.tsrx`/`.tsx` compilation and plain `.ts`/`.js` hook slotting resolve the
  same package model.
- Compiler-managed full and slot-only output encodes the model in its ABI.
  Manually slotted source selected as causal currently fails compilation rather
  than being mislabeled; it may remain behind an explicitly approved permissive
  dependency boundary until the manual ABI is versioned.
- New causal output carries the first numeric state-model policy marker.
- Client, SSR, hydration, universal, development, and production compilation
  resolve the same policy.
- Configuration participates in compiler cache keys. Vite watches existing
  classification manifests and also tracks prospective nearer manifest paths. A
  reported change or creation restarts the dev server, forcing a full reload so
  existing cells cannot retain stale provenance.
- A later auditability phase makes builds emit a deterministic inventory with
  package name, version, resolved root, selected model, declaration origin, and
  authorization origin. Multiple versions or physical roots appear separately.

Unmarked precompiled output is currently classified as `permissive`; deterministic
`legacy-precompiled` reporting lands with the inventory phase. Grandfathering
expires at the named **Causal State Policy ABI 1** (`causal-state-abi-1`) epoch. At
that ABI boundary, unmarked output requires explicit consumer approval. The change
is tied to a policy marker epoch, not vaguely to the next package major.

The replay machinery remains load-bearing for permissive packages, conformance
fixtures, and grandfathered output. The completed causal model guarantees
authored-code determinism and removes unnecessary replay from causal patterns; it
does not claim that this work deletes replay machinery from the runtime.

## 6. Rollout order

Foundation lands before enforcement:

1. **Implemented:** add the configuration shape, package resolver, approval
   errors, compiler-managed component/custom-hook markers, cache behavior,
   two-sided component/cell plumbing, cell-owned hard render/purity enforcement,
   and report-only lifecycle diagnostics. Keep `default: 'permissive'`.
2. Add deterministic inventory, the versioned manual-slot ABI, and the Callback
   Provenance ABI. Ship causal guidance and replacement primitives, classify
   repository hits, and migrate first-party code. Approve dependency packages
   that still need the permissive boundary.
3. Validate the implemented render/initializer/memo/reducer/updater errors against
   the eval corpus, then enable effect setup/cleanup errors after the paved road
   covers observed cases.
4. Flip the product default to `causal` once callback provenance, first-attempt
   and one-iteration agent evals, cross-renderer tests, and the first-party
   inventory pass without a default-wide permissive override.
5. At `causal-state-abi-1`, end automatic grandfathering for unmarked precompiled
   output.

Approving a dependency that declares `permissive` is a legitimate migration action
and is recorded in the inventory. Changing the application default or adding a
package exception to evade a diagnostic in application-owned code is an eval
failure, not a successful repair.

## 7. Naming rationale

`stateModel` is short and teachable: “the causal state model” describes why events
and later callbacks cause transitions while render and lifecycle work do not. Its
scope is bounded explicitly in §2 so it does not imply a different storage or
scheduling implementation.

`causal` gives the native model a stable concept independent of another framework's
current behavior. `permissive` says what the alternate path does—it permits the
existing broader phase behavior—without claiming that it is unsafe in every use or
that it will disappear on a particular date.

The following alternatives are rejected:

- `stateWrites` names one operation rather than the programming model and poorly
  covers reducers, dispatchers, replay, and source provenance.
- `stateSemantics` sounds broader than the selected phase behavior.
- `stateUpdatePolicy` is accurate but administrative and verbose.
- A boolean such as `causalState.enabled` makes a language model look like a lint
  level and leaves `false` underspecified.
- Framework-named values couple the vocabulary to a moving external target and
  make the native model harder to teach in its own terms.
- `strict`, `safe`/`unsafe`, and `good`/`bad` are either overloaded or too absolute.
  Diagnostics should explain the concrete causal rule rather than substitute a
  moral label.
- `compat` is vague about what compatibility means; `legacy` becomes false for
  maintained packages; `unrestricted` is inaccurate because runtime constraints
  still apply.

## 8. Diagnostic language

A cold-read diagnostic should name the model and the active cause:

> Octane's causal state model does not allow `setSelection` while effect setup is
> executing. Move user-caused work to the event or action, derive render values
> directly, read external input through a source, or synchronize outward without
> copying the result into component state.

Compiler diagnostics include the setter declaration site, illegal call site,
active phase, and phase-specific repair guidance. Machine-readable error codes and
production runtime errors use the same causal vocabulary. They do not offer a
local suppression or permissive opt-out.

The naming decision is closed. Remaining questions in the main plan concern ABI
encoding and replacement-primitive details, not the public policy shape or values.

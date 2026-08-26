# Strict-state policy naming and compatibility options

> **Status: HISTORICAL DECISION MEMO; NOT THE SHIPPED CONFIGURATION.** Prepared
> 2026-07-19 as a companion to
> [`strict-state-plan.md`](./strict-state-plan.md). None of the five policy
> objects, manifest flags, runtime guards, or package approval mechanisms below
> were implemented. Octane instead shipped `useLinkedState` in
> [#366](https://github.com/octanejs/octane/pull/366) and opt-in, compiler-only
> Strong mode in [#376](https://github.com/octanejs/octane/pull/376).

## Current implementation

The public configuration is already selected:

```ts
// octane.config.ts
export default {
	compiler: {
		strong: true,
	},
};
```

Strong mode defaults to `false`. A module can also opt itself in with a top-level
`"use strong"` directive. Application configuration applies only to
application-owned source: dependencies and separately manifested workspace
packages retain their existing React-compatible behavior unless their own module
opts in. Vite, Rspack, and Rsbuild also expose a `strong: true` plugin option.

The shipped contract is **compiler-owned**: Strong modules assert immutable
render snapshots and pure render projections. The compiler rejects statically
provable state updates during render or synchronous effect setup, render-time
`ref.current` writes and state-snapshot mutations, and direct reads from known
clock or randomness APIs. Production client builds may condition eligible
user-authored calls, constructors, and tagged templates on their witnessed
inputs without treating `use*` names as a purity signal.
State initializers, `useLinkedState` reconcilers, and its
`sourceEqual`/`valueEqual` callbacks execute synchronously during render;
genuinely deferred callbacks remain valid. `useLinkedState` replaces the
originally proposed keyed-reset hook and compares sources with `Object.is` by
default, including arrays; composite comparisons require `sourceEqual`.

These diagnostics are bounded rather than a whole-program purity proof. Strong
trusts the author assertion even when analysis cannot inspect a call, so reading
an imported live accessor behind stable inputs violates the contract rather than
forcing a compatibility fallback. There is no runtime execution-phase guard, strict/compat hook-cell policy,
package-manifest state-policy field, compatibility allowlist, package approval
flow, or policy inventory. Published Octane packages ship authored source, not
precompiled policy-bearing artifacts. See the current [Strong-mode
guide](./tsrx-basics.md#strong-mode), [linked-state
guide](./tsrx-basics.md#state-that-follows-another-value), and [documented React
differences](./differences-from-react.md#optional-strong-mode).

The remainder preserves naming and containment ideas that could inform a future,
explicitly proposed runtime-backed policy. Example configuration and manifest
fields below are illustrative only; none are current Octane APIs.

## 1. Decision to make

The historical proposal considered a possible future runtime-backed policy with
two behaviors:

- **Native behavior:** authored state transitions are allowed at causal boundaries
  such as events, actions, and later callback turns. They are rejected while render,
  state/reducer initialization, memo evaluation, reducer/updater evaluation, or
  effect setup/cleanup is synchronously on the execution stack.
- **React-compatible behavior:** existing render-phase replay and lifecycle update
  behavior remains available for code that has not migrated yet.

A hypothetical policy could need both a project default and a narrow way to
retain React behavior for third-party Octane packages. The shipped implementation
already achieves application/dependency containment through optional
`compiler.strong` and package ownership, without any of the proposed policy
objects or manifest exceptions.

The naming decision has three independent parts:

1. What is the configuration property called?
2. What are the two behaviors called?
3. Is the API presented as a choice between two models, a positive Octane feature,
   or a React compatibility exception?

The five historical proposals below intentionally varied all three. None was
selected or implemented.

## 2. Shared contract across every proposal

These mechanics belong to the **unimplemented runtime-backed proposal**. They
are not claims about shipped compiler-only Strong mode.

### 2.1 Enforcement

- A future runtime guard could provide semantic defense in development and
  production; today the compiler is the only Strong-mode enforcement surface.
- `useCallback` creation is never itself illegal. The compiler follows local aliases
  and calls and reports only a callback proven to execute synchronously from a
  forbidden phase. Passing a callback to an opaque subscription remains a runtime
  question because registration does not prove synchronous invocation.
- A later timer, observer, subscription notification, async continuation, or
  deliberate deferral is a legal causal transition.
- Internal runtime scheduling would remain outside any future user-dispatcher
  guard.

### 2.2 Compatibility containment

Compatibility must not leak from a dependency into application-authored code.
The shipped compiler already contains its application-wide setting by package.
If a future runtime introduced policy-bearing hook cells, its proposed
composition rule would be:

| Executing code     | Native cell | React-compatible cell |
| ------------------ | ----------- | --------------------- |
| Native             | Throw       | Throw                 |
| React-compatible   | Throw       | Existing behavior     |

Outside a forbidden phase, ordinary updates would remain legal in every
combination. These strict/compatible cell distinctions do not exist in the
shipped runtime.

### 2.3 Third-party packages

The shipped package boundary already prevents application Strong configuration
from claiming dependencies. The following manifest declarations, consumer
approvals, and cell-level propagation are **future proposals, not existing
configuration**:

- Package authors could declare that their package requires React-compatible
  behavior in the existing `octane` object in their `package.json`. Whether that
  declaration is self-authorizing or instead requires consumer approval is an open
  decision called out below.
- Applications could approve a dependency explicitly in future compiler
  configuration.
- Hypothetical consumer exceptions would use exact npm package names. They would
  not accept filesystem
  globs, source paths, export subpaths, or inline comments.
- An exception would not target the application package itself. A nested workspace
  package with its own manifest is a separate package, even when it is physically
  inside the bundler root.
- A future runtime package policy would be non-transitive. Native children and
  native callbacks passed
  into a compatible package retain their originating behavior, and a native setter
  remains native when passed into compatible code.
- A usage-site `compat(Component)` wrapper is not part of the initial design. It is
  too late to govern diagnostics in raw dependency source, does not naturally cover
  imported custom hooks and utilities, and is an easy suppression pattern to copy.
- The existing compiler `exclude` option is unrelated: it relinquishes compiler and
  hook-slot ownership, whereas a compatible package must still compile so its
  policy can be encoded.

The shipped compiler already uses a watched nearest-manifest resolver for package
ownership in
[`bundler.js`](../packages/octane/src/compiler/bundler.js). The implementation should
extend that resolver if a future policy is designed, rather than matching
`node_modules` paths, which are unstable across package managers and symlinks.

There were two proposed authorization models for future package metadata; neither
exists today:

1. **Self-declaration:** the package manifest is sufficient to select compatible
   behavior, and the build inventory makes that decision visible.
2. **Declaration plus approval:** the package manifest declares a requirement, but
   the consuming application must also name the package. An unapproved requirement
   is a build error rather than a silent relaxation.

The second model gives the application stronger control; the first creates less
installation friction. This choice is independent of the five names. In either
model, a normal state diagnostic must not suggest adding an exception; migration
documentation for port authors can describe it separately.

### 2.4 Distribution and auditability

These are possible requirements for a future runtime-backed policy, not current
distribution behavior or build outputs:

- Full `.tsrx`/`.tsx` compilation and plain `.ts`/`.js` hook slotting resolve the
  same package policy.
- Manual-slot packages need the policy encoded in their slot-family ABI rather than
  being permanently defaulted to compatibility.
- Octane currently publishes authored source, not precompiled compiler output.
  The historical idea of versioned precompiled policy markers would matter only
  if that packaging contract changed; it is not needed today.
- Client, SSR, hydration, and universal compilation must resolve the same policy.
- Builds emit a deterministic inventory containing package name, version, resolved
  root, and policy origin (`package-declared`, `consumer-exception`, or
  `legacy-precompiled`). When one npm name resolves to multiple versions or physical
  roots, every affected instance appears separately. CI can baseline the inventory
  and reject unexplained growth.
- Policy configuration participates in compiler cache keys. A change during HMR
  forces a full reload so existing cells cannot retain stale behavior.
- Evaluation runs count adding a compatibility exception as evasion rather than a
  successful repair.

## 3. Historical proposal A — `stateSemantics` (not implemented)

This presents the setting as a choice between two explicitly named semantic models.

```ts
export default defineConfig({
	compiler: {
		stateSemantics: {
			default: 'causal',
			packages: {
				'@vendor/legacy-widgets': 'react',
			},
		},
	},
});
```

Package declaration:

```json
{
	"octane": {
		"stateSemantics": "react"
	}
}
```

Possible diagnostic language:

> This update violates causal state semantics because it executes while the effect
> setup frame is active.

Advantages:

- Covers setters, dispatchers, reducers, replay, and effect frames without naming
  one implementation mechanism.
- `causal` matches the teaching model used by the design: events and later callbacks
  cause transitions; render and commit lifecycle do not.
- The enum is symmetric and can be carried unchanged through direct compiler and
  package-manifest APIs.

Risks:

- `semantics` may sound broader than the phase legality this option actually
  controls.
- `causal` is Octane-specific vocabulary that users must learn.
- The short value `react` could be read as claiming complete React equivalence rather
  than compatibility for this state behavior alone.

## 4. Historical proposal B — `stateModel` (not implemented)

This uses framework names instead of introducing a new conceptual value.

```ts
export default defineConfig({
	compiler: {
		stateModel: {
			default: 'octane',
			packages: {
				'@vendor/legacy-widgets': 'react',
			},
		},
	},
});
```

Package declaration:

```json
{
	"octane": {
		"stateModel": "react"
	}
}
```

Possible diagnostic language:

> Octane's state model does not allow an update while effect setup is executing.

Advantages:

- `octane` versus `react` is immediately understandable without learning `causal`.
- Frames the stricter behavior as the framework's normal model rather than an
  optional safety level.
- Short in application configuration and package metadata.

Risks:

- `stateModel` can imply that storage, equality, batching, scheduling, or hook tuple
  shapes also change.
- Naming the native value `octane` becomes awkward if Octane later supports another
  renderer or authoring profile with the same phase rules.
- Framework-name values can age poorly if React changes its own behavior.

## 5. Historical proposal C — `causalState` (not implemented)

This presents the design as one positive Octane feature with compatibility
exceptions, using a boolean for rollout.

```ts
export default defineConfig({
	compiler: {
		causalState: {
			enabled: true,
			exceptions: ['@vendor/legacy-widgets'],
		},
	},
});
```

Package declaration:

```json
{
	"octane": {
		"causalState": false
	}
}
```

Possible diagnostic language:

> Causal state forbids this update while the effect setup frame is active.

Advantages:

- Gives the feature a concise, positive name that can also headline documentation
  and diagnostics.
- The global rollout switch and third-party exception list are visually obvious.
- Native application code does not appear to select between Octane and React.

Risks:

- `false` in package metadata does not explain which behavior replaces causal state.
- A permanent `enabled` boolean may make a language invariant look like an optional
  optimization.
- The term is unfamiliar and can be mistaken for a state-management architecture
  rather than an execution-phase rule.
- The list shape is less extensible if another behavior is ever introduced.

## 6. Historical proposal D — `stateUpdatePolicy` (not implemented)

This optimizes for precision and uses fully descriptive values, accepting a more
verbose public API.

```ts
export default defineConfig({
	compiler: {
		stateUpdatePolicy: {
			default: 'causal-boundaries',
			packages: {
				'@vendor/legacy-widgets': 'react-compatible',
			},
		},
	},
});
```

Package declaration:

```json
{
	"octane": {
		"stateUpdatePolicy": "react-compatible"
	}
}
```

Possible diagnostic language:

> The causal-boundaries state update policy rejects updates during effect setup.

Advantages:

- Clearly scoped to state updates rather than all state behavior.
- `causal-boundaries` and `react-compatible` are relatively self-explanatory when
  encountered in configuration without surrounding documentation.
- `policy` honestly describes a build-time rule applied differently by package.

Risks:

- Long names make configuration, types, diagnostics, and internal identifiers
  noisy.
- `state update` can still be confused with transition scheduling and update
  priority.
- `policy` sounds administrative rather than like a core programming model.

## 7. Historical proposal E — `reactCompatibility.stateUpdates` (not implemented)

This leaves the native behavior unnamed and configures only the compatibility
surface. The default boolean doubles as the rollout flag.

```ts
export default defineConfig({
	compiler: {
		reactCompatibility: {
			stateUpdates: {
				default: false,
				packages: ['@vendor/legacy-widgets'],
			},
		},
	},
});
```

Package declaration:

```json
{
	"octane": {
		"reactCompatibility": {
			"stateUpdates": true
		}
	}
}
```

Possible diagnostic language:

> State updates during effect setup are not supported by Octane. React state-update
> compatibility is enabled only for declared packages.

Advantages:

- Makes the exceptional behavior explicit while treating the Octane invariant as
  simply the default language.
- A third-party package list reads naturally as a compatibility allowlist.
- Provides a possible home for other narrowly defined React compatibility facets
  without calling the whole application React-compatible.

Risks:

- The native model has no reusable public name for documentation and diagnostics.
- `default: false` is less readable than an enum and becomes `true` during rollout,
  which is easy to misinterpret.
- A general `reactCompatibility` namespace may attract unrelated behavior switches
  and grow into an ill-defined compatibility mode.
- The nested shape is the most verbose for a single policy.

## 8. Comparison

| Proposal | Primary framing | Native term | Compatibility term | Cold-read strength | Main ambiguity |
| -------- | --------------- | ----------- | ------------------ | ------------------ | -------------- |
| A. `stateSemantics` | Symmetric semantic models | `causal` | `react` | Balanced | May imply all state semantics |
| B. `stateModel` | Framework models | `octane` | `react` | Familiar values | May imply storage/scheduling also change |
| C. `causalState` | Positive feature plus exceptions | enabled | exception / `false` | Concise | Boolean opt-out is underspecified |
| D. `stateUpdatePolicy` | Explicit policy | `causal-boundaries` | `react-compatible` | Most precise | Verbose and administrative |
| E. `reactCompatibility.stateUpdates` | Compatibility-only surface | implicit Octane behavior | enabled | Clear exception | Native concept remains unnamed |

The noun and value vocabulary can be considered separately. For example,
`stateSemantics` could use `octane | react`, while `stateModel` could use
`causal | react-compatible`. The team does not need to accept each proposal as an
indivisible package.

## 9. Suggested evaluation rubric

| Criterion | Weight | Question |
| --------- | -----: | -------- |
| Semantic precision | 25% | Does the name describe the actual execution boundary without claiming to control unrelated state behavior? |
| Human and agent comprehension | 20% | From configuration and a diagnostic alone, can someone predict what fails and choose the intended repair? |
| Long-term truthfulness | 15% | Will the vocabulary remain accurate if React compatibility is supported permanently? |
| Safe package exception | 15% | Can one exact dependency retain compatibility without weakening its caller, children, callbacks, or unrelated dependencies? |
| Auditability | 10% | Can CI identify every compatible package instance, version, root, and policy origin? |
| Cross-toolchain fit | 10% | Can the same shape work in direct compilation, Vite, Rspack, Rsbuild, SSR, hydration, and precompiled output? |
| Brevity | 5% | Is normal configuration compact without hiding its meaning? |

Suggested hard disqualifiers:

- The name collides conceptually with React StrictMode or Octane transitions.
- The shape requires an inline pragma, component wrapper, or per-call suppression.
- A package exception propagates transitively into native code.
- Policy resolution requires package lookup on a render or dispatch hot path.
- The shape cannot represent both a rollout default and exact dependency
  exceptions.

## 10. Names deliberately not proposed

- **`stateWrites`** names the guarded operation rather than the programming model
  and does not naturally include reducers, dispatchers, or execution provenance.
- **`strictState`** can be confused with React StrictMode, type strictness, or state
  immutability.
- **`renderPurity`** excludes effect setup and cleanup, which are central to the
  policy.
- **`lifecycleStateUpdates`** is behaviorally descriptive, but render,
  initializers, memo factories, reducers, and functional updaters are not all
  naturally understood as lifecycle code.
- **`stateTransitions`** collides conceptually with `useTransition` and
  `startTransition`.
- **`legacy` / `unsafe` / `permissive`** are value judgments and inaccurately
  describe current React behavior.

## 11. Questions for the team

1. Should the API name both behaviors symmetrically, or name only the React
   compatibility exception?
2. Which native term is clearest on first encounter: `causal`, `octane`,
   `causal-boundaries`, or an implicit default?
3. Should the compatibility value be the concise `react` or the narrower
   `react-compatible`?
4. Does a boolean rollout switch make the migration easier, or make the invariant
   look permanently optional?
5. Is the package boundary sufficient for the first release, or is there a concrete
   third-party case that truly requires export/component-level selection?
6. Is package metadata self-authorizing, or must the consuming application approve
   every declared compatible dependency?
7. Should a package author declaration and a consumer exception use the same field
   name and values?
8. Should unmarked precompiled packages automatically retain current behavior, or
   require an explicit consumer exception after a major compiler/runtime boundary?
9. Which wording produces the best diagnostic when read without documentation?

For review, it is useful to vote on the property noun, native value, compatibility
value, and object shape independently before assembling the final spelling.

## 12. Suggested blind review

Before discussing preferences, show each configuration example without its
explanatory prose and ask reviewers—human or agent—to predict:

1. Does a setter called directly by an effect throw?
2. Does the same setter called by a later timer or observer callback throw?
3. How is one third-party package admitted without weakening application code?
4. Does a compatible package receive permission to update a native cell during
   render?

Record first-answer correctness and the explanation each name evokes. This tests
whether the API teaches the intended model rather than merely sounding attractive
after the model has already been explained.

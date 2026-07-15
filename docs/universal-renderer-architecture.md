# Universal renderer architecture

Status: **experimental phase-one RFC and executable vertical-slice contract**

This document defines the renderer seam intended for `@octanejs/three` and,
later, a ByteDance Lynx/native renderer. It is deliberately narrower than a
general rewrite of Octane's client runtime. The existing DOM compiler and
runtime remain the production renderer; the universal path is a separate
compiler target and runtime module until non-DOM evidence justifies sharing
more machinery.

The central decision is:

> Renderer selection happens while lowering a template. DOM templates keep
> their existing direct codegen. A non-DOM template lowers to an immutable
> static host plan plus dynamic slots and is executed by a separate universal
> core. A renderer driver may expose DOM-like create/update/insert/remove
> operations, but it does not impersonate a DOM and does not own logical tree
> topology.

This answers the tempting simplification directly: most of the seam **can and
should** live at the template boundary. It does not require adding a renderer
field or virtual host calls to every DOM `Block`. A small core-owned topology
and transaction layer is still required because ordering, keyed virtual ranges,
abandonment, refs, and effects are semantics across template operations. A
driver-only DOM facade cannot infer those semantics without fake
`parentNode`/`nextSibling`/comment/fragment objects or mutations during an
uncommitted render attempt.

## 1. Goals and non-goals

Phase one must establish and prove these seams:

- a dependency-free, declarative renderer registry and ordered filename
  resolver shared by direct compilation, language tooling, Vite, Rspack, and
  Rsbuild;
- a compiler-selected universal target that emits static host plans and
  dynamic value slots instead of runtime JSX or a VDOM;
- core-owned logical host records and marker-free ranges;
- a per-root staged transaction that produces one ordered host batch per
  successful commit;
- an optional transport boundary around that batch;
- a non-DOM object driver that proves create, update, insert, move, remove,
  public refs, identity preservation, teardown, commit, and abort;
- an explicit DOM-to-universal boundary that participates in the existing DOM
  context, error, ref, and effect ownership without changing `Block`.

Phase one does **not**:

- port the React Three Fiber API;
- replace or generalize the DOM compiler/runtime;
- implement a Lynx runtime, Rspeedy integration, or cross-thread commit
  acknowledgement;
- define renderer-neutral events, style sheets, assets, layout measurement,
  hydration, serialization, portals, or visibility semantics;
- promise React Reconciler compatibility;
- make the universal ABI stable or public for third-party renderer authors.

## 2. Audit of current ownership

### Compiler and DOM runtime

`packages/octane/src/compiler/compile.js` owns TSRX parsing, hook transforms,
static-template extraction, and the two established codegen modes:

- `mode: "client"` emits direct template-clone DOM code and imports the normal
  `octane` runtime;
- `mode: "server"` emits HTML/streaming SSR code and imports `octane/server`.

The client path is intentionally specialized. Host fragments become hoisted
HTML templates; generated bodies clone and walk concrete DOM nodes and invoke
specialized runtime helpers. Preserving that output is an architectural
constraint, not merely a migration convenience.

`packages/octane/src/runtime.ts` confirms that `Block` is not a renderer-neutral
component record. It is a DOM mount/range record with a `Node` parent,
start/end markers, hydration state, marker ownership, portal behavior,
DOM-specific Activity hiding, and view-transition data. The scheduler, context,
hooks, and effects are intertwined with that representation, but adding a host
vtable to it would put branches and fields on every normal DOM path and would
still leave non-DOM ranges pretending to be nodes.

Consequently, phase one does not modify `Block`, `BlockKind`, the DOM plan
shape, or normal DOM helper calls. The mixed-renderer boundary is an ordinary
DOM component/scope that owns a separate universal root.

### Bundler-neutral app configuration

`packages/app-core` owns application configuration independent of a particular
bundler. Renderer selection belongs in its `compiler` section. Config loading
normalizes serializable renderer data; it must not import or execute a renderer
factory. The normalized value can be included in production configuration and
in cache keys without pulling compiler transforms or renderer graphs into the
server runtime.

### Compiler adapters

`packages/octane/src/compiler/bundler.js` owns canonical module IDs, source
eligibility, package discovery, and transform options common to bundlers.
`packages/octane/src/compiler/vite.js` is a Vite adapter over that compiler.
`@octanejs/rspack-plugin` reaches the same bundler-neutral compiler from its
loader, and `@octanejs/rsbuild-plugin` configures that Rspack plugin for its
client/server environments.

Renderer resolution therefore belongs above the adapter-specific HMR dialect.
Vite may still request `hmr: "vite"` and Rspack may request
`hmr: "webpack"`, but the same normalized config and canonical filename must
produce the same renderer descriptor before either dialect reaches codegen.
Rsbuild inherits the Rspack result rather than owning another renderer
resolver.

Language tooling may import the dependency-free resolver directly. It must not
need to instantiate Vite, Rspack, or the full compiler to decide which intrinsic
namespace and target apply to a file.

### Conflicts found in the pre-phase-one source

The existing source makes several DOM-only assumptions that this phase must
make explicit rather than silently work around:

- direct `compile()` originally accepted only client DOM and server HTML modes;
- the Vite adapter described every client module as using the DOM runtime;
- Rspack's loader option surface and Rsbuild's forwarding path had no shared
  renderer descriptor;
- universal SSR/serialization does not exist;
- DOM portals and `Activity` use real DOM ranges and cannot be inherited by a
  native driver;
- the DOM `Block` shape is observably unsuitable as a universal logical record.

The resolution is an additive compiler option and separate runtime, not a
reinterpretation of those DOM contracts.

## 3. Renderer configuration and resolution

The experimental app configuration is declarative:

```ts
export default defineConfig({
	compiler: {
		renderers: {
			registry: {
				three: '@octanejs/three/renderer',
				object: {
					module: '/src/testing/object-renderer.js',
					target: 'universal',
				},
			},
			default: 'dom',
			rules: [
				{
					include: 'src/scenes/**/*.{tsrx,tsx}',
					exclude: '**/*.dom.tsrx',
					renderer: 'three',
				},
			],
		},
	},
});
```

The normalized shape is equivalent to:

```ts
interface ResolvedRendererConfig {
	readonly default: string;
	readonly registry: Readonly<
		Record<string, { readonly module: string; readonly target: 'dom' | 'universal' }>
	>;
	readonly rules: readonly {
		readonly include: readonly string[];
		readonly exclude: readonly string[];
		readonly renderer: string;
	}[];
	readonly signature: string;
}
```

Normative resolution rules:

1. `dom` is built in as `{ module: "octane", target: "dom" }` and cannot be
   replaced or aliased to a universal target.
2. A string registry entry means `{ module: value, target: "universal" }`.
3. Renderer aliases are stable lowercase IDs. Renderer module IDs are package
   IDs or project-root IDs, not importer-relative paths or executable config.
4. Filenames are canonical project-relative module IDs with forward slashes.
   Query/hash suffixes do not participate in matching.
5. Rules are ordered and the first matching rule wins. An `exclude` only skips
   its own rule; later rules still participate.
6. Pattern sets and registry keys are canonicalized for a stable signature,
   but rule declaration order is preserved because it is semantic.
7. An unknown renderer, malformed pattern, unsupported key, or attempt to
   replace `dom` fails during config normalization.
8. No match selects `default`, which itself must name a registry entry.

`normalizeRendererConfig()` and `resolveRendererForFile()` live in the
dependency-free `octane/compiler/renderers` subpath and are re-exported from
the bundler-neutral compiler surface. `@octanejs/app-core` stores the normalized
form in the resolved app config. This is the single resolver for direct tests,
Vite, Rspack, Rsbuild, and future Volar integration.

The normalized signature is part of transform cache identity. A renderer
module ID is intentionally data, not a callback: changing it changes the
signature and invalidates compilation in every adapter in the same way.

### Server-mode rule

Renderer identity resolution is environment-independent. A file cannot become
DOM merely because it entered a server graph. In phase one,
`mode: "server"` combined with a universal renderer fails with a clear
serialization/hydration capability diagnostic. Adapters must not silently fall
back to DOM codegen. A Three application can keep universal-only scene modules
out of its server graph until the renderer defines a serialization contract.

## 4. Compiler contract

The internal direct-compiler option is:

```ts
interface CompilerRendererDescriptor {
	readonly id: string;
	readonly module: string;
	readonly target: 'dom' | 'universal';
}

compile(source, filename, {
	mode: 'client',
	renderer: descriptor,
});
```

Adapters pass `renderer` only for a non-DOM selection. Omitting it follows the
exact pre-existing DOM branch. Passing the built-in DOM descriptor must not be
used as an excuse to rewrite the normal DOM path.

For a universal descriptor, the compiler:

1. runs the shared TSRX parsing, type erasure, hook-slot, dependency, and
   component analysis that is host independent;
2. lowers host JSX into immutable `host`, `range`, `text`, and `slot` plan
   records;
3. hoists static host structure once per module;
4. emits current dynamic expressions as a compact values vector;
5. wraps compiled components with renderer identity metadata;
6. imports the internal helpers
   `defineUniversalComponent`, `universalPlan`, `universalValue`,
   `universalList`, and `universalKey` from the selected renderer module ID.

A representative shape is:

```ts
const plan = universalPlan('three', {
	kind: 'host',
	type: 'mesh',
	props: { castShadow: true },
	bindings: [['position', 0]],
	children: [
		{
			kind: 'host',
			type: 'boxGeometry',
			bindings: [['args', 1]],
		},
	],
});

export const Box = defineUniversalComponent(
	'three',
	(props) => universalValue(plan, [props.position, props.args]),
	{ module: '@octanejs/three/renderer' },
);
```

This is an explanatory form, not a stable emitted-code golden. The important
ABI is static plan plus dynamic values, not these local variable names.

There is no runtime JSX descriptor walk. A static element is represented once
in the plan; only its dynamic slots are reevaluated. Keyed template control
flow uses explicit keys (`universalKey`/`universalList`) and produces logical
ranges when an item has more than one root.

The selected renderer module is expected to provide the compiler ABI helpers,
normally by re-exporting the experimental universal core alongside
renderer-specific entry points. The phase-one lowering runs the resulting
JSX-free module through the existing client hook/dependency transform and then
retargets its Octane runtime import to the selected renderer module. That module
must therefore re-export the universal hook/runtime ABI used by the source as
well as the five plan helpers. The compiler does not load the renderer module
during configuration or compilation. This keeps configuration cacheable and
lets a renderer package define its intrinsic TypeScript surface without
installing a compiler plugin callback.

The lowering is fail-closed. Before the second pass, the compiler proves that
no JSX/TSRX remains in setup statements, dynamic expressions, arrow functions,
or other module declarations. It also validates named `octane` runtime imports
against the phase-one universal runtime. Unsupported JSX or hooks diagnose at
the original source location; they can never be erased by the DOM compiler or
turn into an accidental `createElement` import.

### Exact phase-one syntax boundary

The first lowering intentionally accepts a narrow executable subset:

- named function declarations using `@{}` or one final JSX `return`;
- lowercase intrinsic host tags and fragments;
- literal/boolean static attributes and expression-valued dynamic attributes;
- static/dynamic text and other dynamic child expressions;
- synchronous keyed `@for`, with an explicit key and one item binding;
- setup statements and supported hooks, which continue through the existing
  hook-slot/dependency transform.

It diagnoses arrow, async, and generator components; nested component tags;
member/namespaced tags and attributes; spread attributes; `@if`, `@switch`,
`@try`, `@Activity`; `@empty`; async collections; and scoped `<style>`. A
return-style component must have one final JSX return, and component-level
early returns diagnose until branch plans are transactional. These are phase
boundaries, not statements that the features are architecturally impossible.
Most need component-owner/control-flow records or a renderer capability before
their lowering can be made transactional. The compiler must never handle one
of these cases by falling back to DOM output for a universally selected file.

### DOM byte-identity invariant

With no renderer config, with a config that resolves a file to `dom`, and
before/after adding universal support, normal client DOM output must be
byte-identical for the same compile options. In particular:

- no host interface call appears in a DOM template;
- no renderer ID is stored on ordinary DOM `Block`/`Scope` objects;
- no universal helper is imported by a DOM module;
- DOM SSR output and hydration markers are unchanged;
- existing HMR, profiling, production-slot, and source-map branches retain
  their current behavior.

## 5. Universal plan and root contracts

The phase-one types live under the experimental `octane/universal` subpath.
They are exported so the object slice and the next renderer package can be
implemented, but they are not yet a compatibility promise.

### Immutable plan

```ts
type UniversalPlanNode =
	| {
			readonly kind: 'host';
			readonly type: string;
			readonly props?: Readonly<Record<string, unknown>>;
			readonly bindings?: readonly (readonly [name: string, slot: number])[];
			readonly children?: readonly UniversalPlanNode[];
	  }
	| { readonly kind: 'text'; readonly value?: string; readonly slot?: number }
	| { readonly kind: 'slot'; readonly slot: number }
	| { readonly kind: 'range'; readonly children: readonly UniversalPlanNode[] };

interface UniversalPlan {
	readonly renderer: string;
	readonly root: UniversalPlanNode;
}
```

`host` is a renderer intrinsic, not necessarily a node. `range` is logical and
never reaches a driver as a comment or fragment. `slot` may materialize a
primitive, another plan value, a keyed list, an array, or emptiness according
to the phase-one value rules. Plan construction validates and freezes static
records so a renderer cannot observe a half-mutated plan.

### Logical records

Each universal root owns records with a core ID, key, kind, host type/props,
logical parent, and ordered logical children. Range records have no physical
host instance. Flattening a range yields its physical host descendants only
when commands are planned for a concrete parent.

This topology provides three things a driver must not emulate:

- the before-position for insertion or movement through a marker-free range;
- survivor identity for keyed multi-root values;
- the committed baseline against which an uncommitted draft is reconciled.

A keyed range reorder reuses records when key, record kind, and host type are
compatible. It may emit explicit `move` commands, but it never deletes and
recreates a surviving host merely because a sibling range moved. Minimal-move
LIS optimization is not a phase-one requirement; correct final order and
survivor identity are.

### Driver and commands

The deliberately small driver surface is DOM-like in vocabulary, not in data
model:

```ts
type UniversalHostCommand =
	| { op: 'create'; id: number; type: string; props: Readonly<Record<string, unknown>> }
	| { op: 'update'; id: number; props: Readonly<Record<string, unknown>> }
	| { op: 'insert' | 'move'; parent: number | null; id: number; before: number | null }
	| { op: 'remove'; parent: number | null; id: number }
	| { op: 'destroy'; id: number };

interface UniversalHostBatch {
	readonly renderer: string;
	readonly version: number;
	readonly commands: readonly UniversalHostCommand[];
}

interface UniversalHostDriver<Container, PublicInstance> {
	readonly id: string;
	readonly capabilities?: ReadonlySet<string>;
	commit(container: Container, batch: UniversalHostBatch): void;
	getPublicInstance(container: Container, id: number): PublicInstance | null;
}
```

`parent: null` means the root container. IDs and `before` references name
core records, not driver object identity. `remove` detaches a live instance;
`destroy` releases its renderer-owned resources. This distinction is needed
for movement, temporary detachment, disposal, and future renderer-specific
ownership rules.

`version` is a monotonic prepared-batch sequence, so aborted attempts may leave
gaps in the versions observed by a driver. Drivers order accepted batches by
their increasing values and must not interpret a gap as a missing commit.

The driver's `commit` contract is atomic: validate the full ordered batch
before making visible changes, then apply it as one commit. A driver must not
retain prepared instances before `commit`; creation is a command, not a
render-time callback. A renderer that cannot provide local atomicity must place
the batch behind a transport or host transaction that can.

The generic command set intentionally does not contain events, styles, asset
loading, visibility, layout, or specialized collection attachment. Those are
capabilities/extensions, described below, rather than mandatory methods every
driver must fake.

### Root transaction

```ts
interface UniversalRoot<P> {
	readonly renderer: string;
	prepare(component: UniversalComponent<P>, props: P): UniversalPreparedAttempt;
	render(component: UniversalComponent<P>, props: P): UniversalPreparedAttempt;
	unmount(): void;
}

interface UniversalTransaction {
	readonly status: 'prepared' | 'committed' | 'aborted';
	readonly batch: UniversalHostBatch;
	commit(): void;
	abort(): void;
}
```

During `prepare`, the core evaluates the component, materializes a blueprint,
reconciles draft records, and stages:

- ordered host commands;
- the next logical topology and hook cells;
- ref detach/attach work;
- insertion, layout, and passive effect work.

It does not call the driver. Suspension returns a suspended attempt and retains
the last committed topology. A thrown render error discards the draft. A newer
prepare aborts the older prepared transaction. Explicit abort discards all
staged work. Because the driver has not prepared instances, all three paths
produce zero visible object-host mutations and zero leaked prepared instances.

A successful commit has this phase ordering:

1. exactly one driver/transport batch acceptance;
2. publish logical topology and committed hook state;
3. insertion-effect cleanups and creates;
4. layout-effect cleanups and old ref detach work;
5. public ref attaches and layout-effect creates;
6. passive cleanups followed by passive creates in a later microtask if the
   hook/root is still current.

Pending passive work is flushed before the next universal render attempt. This
keeps two same-turn commits distinct instead of dropping or merging the first
commit's passive phase. Cleanup walks retain the previous render's declaration
order even when removed hooks and dependency-changed hooks share a phase.

Within the host batch, phase one orders creates, updates, detach/removes,
placements (`insert`/`move`), and final destroys so every referenced instance
exists before placement and no destroyed instance remains attached.

The driver must validate atomically so commit rejection cannot leave a partial
host tree. Cleanup/ref/effect work is deliberately held until host acceptance:
a rejecting driver leaves the previous logical topology, refs, and effects
intact. Once accepted, user callbacks may still throw; the transaction is then
finalized as host-committed and removed from the root's pending slot. The core
continues later ref/layout work before rethrowing the first callback error, so a
throwing insertion effect or layout cleanup cannot strand an accepted host
tree with permanently unattached refs. Such an error is a commit-phase fault,
not an abandoned render attempt.

`render()` is the synchronous convenience form: prepare and immediately commit
when preparation succeeds. `unmount()` emits one final remove/destroy batch,
runs insertion/layout cleanups and detaches refs synchronously, defers mounted
passive cleanups, and disposes the root owner.

### Optional transport

```ts
interface UniversalCommitTransport<Container> {
	commit(
		container: Container,
		batch: UniversalHostBatch,
		applyLocally: (batch: UniversalHostBatch) => void,
	): void;
}
```

Three can omit a transport and mutate its scene graph synchronously. A future
Lynx driver may serialize the ordered batch, coalesce platform messages, or
hand it to another thread. The phase-one transport is synchronous from the
core's perspective: it has no acknowledgement, rollback, or asynchronous
layout-read protocol. Those semantics must be designed before a cross-thread
renderer can claim layout effects or commit failure recovery.

## 6. Renderer identity and ownership

Renderer identity is explicit at every durable boundary:

- resolved config yields `{ id, module, target }` for a filename;
- a compiled universal component carries immutable renderer metadata;
- every static plan carries its renderer ID;
- a universal root owns the driver and renderer ID;
- every batch carries that ID;
- a host boundary carries owner-renderer/child-renderer metadata.

The root checks component metadata, plan materialization checks plan identity,
the boundary checks its root, and the driver checks root/container/batch
identity. Development diagnostics name both sides of a mismatch.

There is no mutable `currentRenderer` used to choose host behavior. The
universal hook implementation may use a synchronous render-attempt cursor in
the same way a hook runtime needs a current owner, but renderer identity comes
from that attempt's root owner and is never changed to select a nested host.
Durable callbacks close over the owner:

- state/reducer setters schedule their root owner;
- a suspended thenable schedules that same owner when it settles;
- refs and effects stay on the transaction/root that prepared them;
- a mixed-boundary invalidation closes over its DOM scope owner;
- an async retry re-enters through the owning root rather than consulting a
  process-global renderer.

Phase one does not yet implement universal transition lanes. Its
`startTransition` behavior is only a compatibility stub, so it makes no timing
parity claim. The next scheduler phase must carry the root owner and renderer
identity on queued transition work exactly as urgent updates do; introducing a
mutable renderer switch is not an option.

## 7. Explicit mixed-renderer boundaries

File rules select a lexical default; they do not implicitly reinterpret an
arbitrary child. Switching renderer is an explicit boundary owned by a
renderer package. The intended authoring model is eventually:

```tsx
<Canvas>
	<mesh />
	<Html>
		<button>DOM overlay</button>
	</Html>
</Canvas>
```

Here `Canvas.children` is declared as `dom -> three`, and `Html.children` is a
separate `three -> dom` boundary. The declaration is metadata on the boundary
component/export, not Vite or Rspack metadata and not a mutable runtime switch.

Phase one proves only the first direction through
`createUniversalHostBoundary(renderer)`. Its metadata shape is:

```ts
interface UniversalBoundaryMetadata {
	readonly id: string;
	readonly ownerRenderer: string;
	readonly childRenderer: string;
	readonly childrenProp: string;
}
```

The experimental boundary currently receives an already-created universal
root, a compiler-defined universal component, and its props. It is an ordinary
void DOM component:

1. render calls `root.prepare()` and therefore performs no host mutation;
2. it reads parent context through the existing DOM `useContext` owner;
3. it commits the prepared transaction from the boundary's existing DOM layout
   effect, so an abandoned DOM render never commits the object host;
4. render errors thrown by the universal component continue through the
   surrounding DOM error route;
5. universal refs attach and universal layout effects run inside that boundary
   layout commit, before later ancestor layout effects;
6. boundary cleanup unbridges and unmounts the universal root.

Because the phase-one DOM boundary intentionally adds no `Block` rollback
field, it also installs a same-turn abandonment guard for each prepared or
suspended attempt. A successful synchronous DOM layout commit disarms the
guard. If a later sibling throws and that layout commit never occurs, the guard
aborts the attempt and releases initial root ownership before an async retry can
mutate the object host. A future concurrent/off-screen boundary protocol should
replace this phase-one guard with explicit DOM WIP rollback registration.

No `Block` field, `BlockKind`, fake node, marker, or DOM plan change is needed.
Universal state updates call the captured boundary invalidator, which schedules
the existing owning DOM scope and prepares the next external transaction.

On suspension, phase one keeps the previously committed external host tree (or
an empty tree on initial mount), commits nothing, and schedules the boundary
owner after settlement. It does not yet project universal suspension into the
parent DOM `@pending` UI or inherit DOM transition-hold timing. That is a
separate boundary protocol gate.

The context/error proof is similarly scoped. A universal root under this
boundary can read an enclosing DOM Provider and a synchronous universal render
error reaches an enclosing DOM `@try`. A standalone universal root sees a
context's default value. Universal Provider components, nested universal
component owners, and universal `@try` boundaries are not part of this first
compiler subset.

The phase-one metadata says which prop is renderer-owned but the compiler does
not yet perform arbitrary nested child-target lowering from it. `Canvas`-style
`children` lowering, intrinsic typing per renderer, reverse `Html` ownership,
and boundary-aware SSR are the next compiler/package gates.

## 8. Object renderer proof

The object driver is an executable protocol probe, not a proposed application
renderer. Its container holds an ordered root `children` array, a map of public
instances, and the committed batches. Each public instance has a stable core
ID, type, props, and ordered child array.

Before touching the live container, the driver simulates and validates every
command against copied IDs/relationships. Only a valid full batch is applied,
then recorded once. This proves the atomic driver contract without DOM nodes.

The vertical slice must demonstrate:

- initial create and insert;
- props update without identity replacement;
- insertion before an existing sibling;
- keyed movement, including a multi-root logical range, with survivor object
  identity preserved;
- remove followed by resource destroy;
- public callback/object ref attachment after commit and detachment on change
  or teardown;
- insertion/layout/passive effect ordering around the batch;
- explicit abort, render error, and suspension with no batch and no prepared
  host instances;
- a live allocated-instance count that remains unchanged across abandoned
  attempts;
- one recorded batch for each successful root commit and one teardown batch.

Text is represented as a `#text` host only because the object driver declares a
text capability. Materialization rejects a driver that has not opted into that
capability. The spelling is an internal convention for this proof, not a
requirement that Three or Lynx allocate text nodes.

## 9. Optional capabilities and extensions

The core protocol is intentionally smaller than a browser. A renderer must
declare, implement, or reject these independently.

| Capability | Phase-one behavior | Next contract gate |
| --- | --- | --- |
| Text | Object driver accepts primitive text through a `text` capability and `#text` proof host. | Define renderer-specific text creation/update and compile-time unsupported-text diagnostics. |
| Events | Event-looking props are only props; there is no universal delegation or synthetic event layer. | Define renderer event registration, update, payload, priority, and teardown. Three ray events and Lynx native events need not share an implementation. |
| Styles | No renderer-neutral style object or stylesheet lifecycle. | Add typed renderer extensions for material/style application and disposal; do not copy CSS rules into native renderers. |
| Assets | No prepare-time asset allocation. | Add cancellable/resource-owned capabilities whose acquisition is staged or externally cached. |
| Visibility / `Activity` | Unsupported and capability-gated; DOM hiding is not reused. | Define hide/show commands, effect disconnection, ref behavior, and resource retention for each renderer. |
| Portal | `createPortal` fails clearly for the phase-one universal renderer. | Define target identity, logical ownership versus physical parent, transport scope, and cross-renderer portal restrictions. |
| Hydration / serialization | Universal server compilation fails; no host adoption exists. | Define renderer serialization, seed identity, mismatch behavior, and whether a renderer supports hydration at all. |
| Layout measurement | Public instances are available after commit; there is no neutral measure call. | Define synchronous-local versus transport-acknowledged layout and the point at which layout effects may run. |
| Specialized collections | Not forced into generic child insertion. | Add renderer-namespaced commands/capabilities for Three `attach`, render lists, native collections, or other ownership models. |

The phase-one `capabilities` set is descriptive rather than a complete compiler
manifest. The compiler already diagnoses deferred syntax such as scoped styles
and Activity, and the runtime rejects portals clearly, but it cannot yet prove
every renderer-specific unsupported prop or host type. The next capability
manifest must make absence fail at compile time when statically knowable or
with a renderer-naming development error at the owning root. It must never fall
back to a DOM interpretation.

## 10. Invariants

The architecture is acceptable only while these invariants hold:

1. The normal DOM path is byte-identical and has no universal dispatch cost.
2. Renderer selection for a normalized config/filename is independent of
   Vite, Rspack, Rsbuild, HMR dialect, and path separator.
3. Renderer switching is lexical and explicit. A child never inherits from a
   mutable process-global renderer.
4. A universal root, component, plan, boundary, batch, driver, and container
   agree on renderer identity before visible mutation.
5. The universal core owns logical ordering and virtual ranges. Drivers own
   host instances and resources, not fake topology nodes.
6. Preparing a render cannot call a host driver or user ref/effect commit work.
7. Suspension, render error, supersession, and explicit abort commit zero host
   commands and leak zero prepared instances.
8. Every successful universal commit reaches the host as one ordered batch.
9. The committed logical topology advances only with the accepted batch.
10. Reordering a keyed range preserves compatible survivor host identity and
    produces the requested final order without physical comment markers.
11. Public refs attach only after their instances exist, detach only after the
    replacement/removal batch is accepted and before any replacement ref
    attaches, and never observe an abandoned draft.
12. A mixed boundary reads context and routes render errors through its owning
    DOM scope; its host commit is gated by that scope's layout commit.
13. Unsupported browser/native concepts are capability failures, not methods
    every driver must fake.

## 11. Validation gates

Phase-one implementation is a go only when focused executable tests cover the
following observation boundaries:

| Gate | Required evidence |
| --- | --- |
| DOM isolation | Existing DOM compiler goldens are byte-equal when renderer config is omitted or resolves to `dom`. Existing DOM runtime tests remain unchanged. |
| Direct compiler selection | The same source emits DOM output for `dom`, universal helper imports/plan output for a universal descriptor, and rejects renderer mismatch or universal server mode. |
| Shared config | Normalization, first-match/exclude behavior, path canonicalization, and stable signatures are tested without a bundler. |
| Adapter parity | Direct bundler compiler, Vite, Rspack loader/plugin, and Rsbuild choose the same descriptor for the same normalized config and canonical filename. |
| Logical ranges | A keyed multi-root range reorders without marker hosts and preserves public-instance identity. |
| Atomic attempts | Suspension, render error, superseded prepare, and explicit abort leave the object tree, commit log, refs, effects, and allocated-instance count unchanged. |
| Batch boundary | Each successful render contributes exactly one ordered batch; teardown contributes one final batch when hosts exist. |
| Mutation vocabulary | Create/update/insert/move/remove/destroy are all exercised through the object driver's public tree. |
| Identity diagnostics | Component/plan/root/boundary/container/driver mismatches fail with both expected and received renderer IDs in development. |
| Mixed ownership | A DOM parent provides context to an object child; child render errors reach the DOM error owner; ref and effect ordering straddle the single object commit correctly; DOM unmount tears the external root down. |
| Capability gates | Portal and Activity/visibility behavior is either implemented under an explicit capability or rejected clearly. Phase one chooses rejection. |

Repository-wide typechecking and formatting remain required after the focused
compiler/runtime/adapter suites. A user-facing experimental config or package
export receives a patch changeset even though the ABI is not stable.

## 12. Migration phases

### Phase 1: foundation and object vertical slice

Land the shared renderer resolver, compile-option plumbing, universal static
plan lowering, experimental root/transaction core, object driver, and one
DOM-to-object boundary. Keep every universal API explicitly experimental or
internal. Prove the validation table above.

Phase-one limitations are intentional:

- component declarations are named functions; host tags/fragments, dynamic
  slots, and synchronous keyed `@for` are supported, while nested components,
  spreads, `@if`/`@switch`/`@try`, Activity, `@empty`, async collections,
  scoped styles, and non-final/multiple JSX returns diagnose rather than deopt
  to DOM;
- the universal owner graph is one root component in this slice: standalone
  context reads use defaults, while the mixed boundary can bridge an enclosing
  DOM Provider; nested universal Providers/error owners are deferred;
- universal SSR/hydration, portals, Activity, event semantics, layout
  measurement, async transport acknowledgement, and transition lanes are not
  implemented;
- mixed-boundary suspension does not yet drive the parent's DOM fallback;
- renderer-owned child-prop lowering and a reverse universal-to-DOM boundary
  are metadata designs, not a complete `Canvas`/`Html` implementation;
- universal source maps currently describe the JSX-free intermediate rather
  than composing all the way back to original TSRX;
- the wrapper does not yet participate in component-specific HMR registration,
  profiling instrumentation, or parallel-`use()` planning, although normal DOM
  modules retain all three unchanged;
- the direct `octane/compiler/vite` adapter accepts the normalized renderer
  config, but the higher-level `@octanejs/vite-plugin` still loads app config
  too late to forward `compiler.renderers` into its already-created compiler;
  apps using that metaframework wrapper must pass its inline `renderers` option
  or wait for the next config-lifecycle phase;
- the driver/plan/helper ABI may change before the first real renderer validates
  host disposal, events, attachment, and frame scheduling.

### Phase 2: `@octanejs/three` proving renderer

Build the smallest real Three package on the phase-one seam:

- a `Canvas.children -> three` boundary and typed Three intrinsic catalog;
- Three object creation, prop application/diffing, insert/move/remove, disposal,
  and public instances;
- renderer-specific `attach`/collection ownership rather than encoding it as
  fake children;
- frame invalidation and layout/effect timing;
- ray/pointer event capability;
- asset/Suspense ownership;
- Three portals if justified;
- an `Html.children -> dom` reverse boundary, including its concrete DOM mount
  container and teardown.

Only after this phase should helper names, driver extensions, or boundary
authoring APIs be considered for a stable public renderer SDK.

### Phase 3: transport and Lynx/native proof

Use Rsbuild/Rspeedy as the bundler path but preserve the same renderer resolver.
Add a serializable command schema, transport sequencing, acknowledgement,
commit failure behavior, native event delivery, layout-read timing, visibility,
and native collection capabilities. Decide which native roots support
serialization or hydration; absence remains a valid declared capability.

This phase must prove renderer/root identity across the thread boundary. A
message may carry IDs and versions, but receiving it must never consult a
mutable global renderer.

### Phase 4: scheduler/parity expansion and API stabilization

Integrate universal updates with transition lanes, DOM-parent Suspense
projection, error behavior for asynchronous transport faults, Activity if a
portable contract emerges, profiling/devtools, and any justified shared hook
scheduler pieces. Re-run size/performance evidence before moving anything into
the DOM hot path. Publish a renderer SDK only after both Three and one
transported/native renderer agree on the stable minimum.

## 13. Rejected alternatives

### React Reconciler

React Reconciler would import Fiber's runtime VDOM, mutation lifecycle, lane
model, and host-config assumptions into a compiler-first framework. It would
discard Octane's static-template advantage, duplicate Octane's hook/scheduler
semantics, and make renderer progress depend on an unstable React-internal API.
Compatibility with React Three Fiber's implementation is not worth replacing
Octane's architecture; API familiarity can be built at the Three package layer.

### Solid's ten-operation universal interface verbatim

Solid correctly demonstrates compiler-selected renderer imports, which this
RFC adopts. Its small DOM-shaped operation set is not sufficient verbatim for
Octane's requirements: it leaves ordering/topology in objects that behave like
nodes, has no Octane render-attempt transaction, and does not express
marker-free keyed multi-root ranges or an optional serialized commit batch.
The lesson is registry-selected codegen, not ten mandatory fake-DOM methods.

### Svelte's unmerged universal-renderer proposal verbatim

Svelte's work highlights two useful lessons adopted here: renderer identity
must propagate explicitly, and static trees require target-specific lowering
rather than a runtime JSX escape hatch. Its proposal is unmerged and tied to
Svelte's generated lifecycle/effect model. It does not directly supply Octane's
hook ownership, `Block` integration, staged refs/effects, or transported commit
contract, so it is prior art rather than an ABI.

### A fake DOM driver

Teaching Three or Lynx objects to expose `parentNode`, `nextSibling`, comments,
fragments, and DOM insertion semantics moves framework bookkeeping into every
driver and makes virtual ranges physical. It also tempts the compiler/runtime
to mutate during render because DOM methods are immediate. Core-owned records
and ranges are smaller, testable without a browser, and serialize naturally.

### Generalizing the existing DOM `Block` and plan

This would add renderer identity, host virtual calls, and non-DOM cases to the
hottest and most mature path. The current `Block` contract fundamentally
contains DOM `Node` parents/markers, hydration, view transitions, and DOM
Activity behavior; abstracting the type would not remove those assumptions.
It would risk codegen-byte regressions and hidden-class/performance regressions
before any real non-DOM renderer exists.

The phase-one boundary proves that sharing context/error/effect ownership does
not require sharing host records. If later measurements show a scheduler or
hook cell can be reused safely, it can be extracted after evidence from two
renderers; the DOM representation itself remains specialized.

## 14. Decision checkpoints before publishing

The experimental contract remains internal until all of these have evidence:

- Three validates host creation, disposal, special attachment, events, layout,
  assets, and renderer-owned children without fake nodes;
- a transported renderer validates batch serialization and acknowledgement;
- `Canvas` and `Html` prove both boundary directions and ownership cleanup;
- transition and Suspense semantics are specified across a boundary;
- capability diagnostics are usable from the compiler and language tooling;
- DOM byte size and performance remain unaffected;
- two renderer implementations agree that the core driver surface is the
  minimum rather than an object-driver artifact.

Until then, config types, `octane/universal`, boundary metadata, helper imports,
plan records, command ordering, and capability names may change in patch
releases. The stable commitment in this phase is architectural: template-level
selection, explicit renderer identity, core-owned logical topology, staged
one-batch commit, and an untouched optimized DOM path.

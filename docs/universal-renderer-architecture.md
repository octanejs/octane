# Universal renderer architecture

Status: **experimental executable client architecture**

This document defines the implemented renderer seam intended for
`@octanejs/three` and, later, a ByteDance Lynx/native renderer. It is
deliberately narrower than a general rewrite of Octane's client runtime. The
existing DOM compiler and runtime remain the production renderer; the
universal path is a separate compiler target and runtime module until non-DOM
evidence justifies sharing more machinery.

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

The universal client target establishes and proves these seams:

- a dependency-free, declarative renderer registry and ordered filename
  resolver shared by direct compilation, language tooling, Vite, Rspack, and
  Rsbuild;
- a compiler-selected universal target that emits static host plans and
  dynamic value slots instead of runtime JSX or a VDOM;
- normal component composition, props/children, spreads, fragments, early
  returns, template directives, hooks, context, refs, effects, error owners,
  and Suspense owners on that target;
- core-owned logical host records and marker-free ranges;
- a per-root staged transaction that produces one ordered host batch per
  successful commit;
- an optional transport boundary around that batch;
- a non-DOM object driver that proves create, update, insert, move, remove,
  public refs, identity preservation, teardown, commit, and abort;
- renderer-classified event listeners whose committed batch representation is
  transportable and whose in-process dispatch retains the logical owner;
- statically declared renderer-owned props in both DOM-to-universal and
  universal-to-DOM directions, without changing `Block` or guessing renderer
  identity from dynamic ancestry;
- renderer-declared text, visibility, intrinsic-type, and client-only server
  policies shared by the compiler and bundler adapters;
- prepared host acceptance, stable-ID public-instance recreation, host
  lifecycle/local callbacks, prop codecs and resource handles, nested event
  scopes, and retained Activity/Suspense ownership;
- source maps, HMR, profiling, and parallel-`use()` planning on the universal
  compiler branch.

The current implementation does **not**:

- port the React Three Fiber API;
- replace or generalize the DOM compiler/runtime;
- implement a Lynx runtime, Rspeedy integration, or cross-thread commit
  acknowledgement;
- define renderer-neutral style sheets, assets, layout measurement, live host
  serialization/adoption, or general portals;
- project a universal child suspension or DOM-owner Activity state across a
  mixed-renderer boundary; those are Three integration gates rather than
  partial properties of the host-neutral core;
- promise React Reconciler compatibility;
- make the published experimental universal ABI a stable or supported renderer
  SDK for third-party authors.

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

Consequently, universal rendering does not modify `Block`, `BlockKind`, the DOM
plan shape, or normal DOM helper calls. The mixed-renderer boundary is an
ordinary DOM component/scope that owns a separate universal root.

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

### Conflicts found in the original DOM-only source

The original source made several DOM-only assumptions that the universal
implementation makes explicit rather than silently working around:

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
				three: {
					module: '@octanejs/three/renderer',
					target: 'universal',
					server: 'client-only',
					intrinsics: '@octanejs/three/intrinsics',
					text: 'ignore',
					capabilities: ['visibility'],
				},
				object: {
					module: '/src/testing/object-renderer.js',
					target: 'universal',
					text: 'host',
					capabilities: ['visibility'],
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
			boundaries: {
				'@octanejs/three': {
					Canvas: {
						ownerRenderer: 'dom',
						childRenderer: 'three',
						prop: 'children',
						server: 'omit-child',
					},
				},
			},
		},
	},
});
```

The normalized shape is equivalent to:

```ts
interface ResolvedRendererConfig {
	readonly default: string;
	readonly registry: Readonly<
		Record<
			string,
			{
				readonly module: string;
				readonly target: 'dom' | 'universal';
				readonly server: 'render' | 'client-only' | 'unsupported';
				readonly intrinsics?: string;
				readonly text: 'reject' | 'ignore' | 'host';
				readonly capabilities: readonly string[];
			}
		>
	>;
	readonly rules: readonly {
		readonly include: readonly string[];
		readonly exclude: readonly string[];
		readonly renderer: string;
	}[];
	readonly boundaries: Readonly<
		Record<
			string,
			Readonly<
				Record<
					string,
					{
						readonly ownerRenderer: string;
						readonly childRenderer: string;
						readonly prop: string;
						readonly server?: 'omit-child';
					}
				>
			>
		>
	>;
	readonly signature: string;
}
```

Normative resolution rules:

1. `dom` is built in with `server: "render"` and `text: "host"`; it cannot be
   replaced, assigned universal capabilities, or aliased to a universal target.
2. A string registry entry means a universal renderer with
   `server: "unsupported"`, `text: "reject"`, and no capabilities.
3. Renderer aliases are stable lowercase IDs. Renderer module IDs are package
   IDs or project-root IDs, not importer-relative paths or executable config.
4. Filenames are canonical project-relative module IDs with forward slashes.
   Query/hash suffixes do not participate in matching.
5. Rules are ordered and the first matching rule wins. An `exclude` only skips
   its own rule; later rules still participate.
6. Pattern sets and registry keys are canonicalized for a stable signature,
   but rule declaration order is preserved because it is semantic.
7. `server`, `text`, `intrinsics`, and sorted/deduplicated `capabilities` are
   serializable descriptor data and participate in the stable signature.
8. Boundary metadata is keyed by stable package/project-root module ID and
   export name. It declares a distinct owner renderer, child renderer, one
   JavaScript prop name, and optionally `server: "omit-child"`. Omission is
   legal only from a server-renderable owner into a client-only child.
9. An unknown renderer, malformed pattern, unsupported key, or attempt to
   replace `dom` fails during config normalization.
10. No match selects `default`, which itself must name a registry entry.

`normalizeRendererConfig()` and `resolveRendererForFile()` live in the
dependency-free `octane/compiler/renderers` subpath and are re-exported from
the bundler-neutral compiler surface. `@octanejs/app-core` stores the normalized
form in the resolved app config. This is the single resolver for direct tests,
Vite, Rspack, Rsbuild, and Volar virtual files.

The normalized signature is part of transform cache identity. A renderer
module ID is intentionally data, not a callback: changing it changes the
signature and invalidates compilation in every adapter. `rsbuild dev` watches
the Octane config and its imported helpers with Rsbuild's `reload-server` mode
so all Rspack compilers are reconstructed atomically with the new renderer
snapshot.

The boundary table is also normalized and included in that signature. Vite
loads `compiler.renderers` before constructing its compiler plugin and watches
the config dependency graph; Rspack and Rsbuild forward the same normalized
registry and boundary table. Direct compilation and all three integrations
therefore make the same lexical target decision.

### Server-mode rule

Renderer identity resolution is environment-independent. A file cannot become
DOM merely because it entered a server graph. A universal renderer with
`server: "unsupported"` still fails with a serialization/hydration capability
diagnostic. A `client-only` module instead becomes an export-preserving inert
server stub: authored imports, declarations, and setup never execute. The DOM
owner must declare `server: "omit-child"` on the matching boundary; after that
region is removed, any remaining live import/re-export use fails at its authored
location. Side-effect-only imports become no-ops.

The neutral compiler, Vite, Rspack, and Rsbuild attach the same stable client
reference identity to the client module and server stub. Adapter manifests
record that identity beside its concrete browser chunks; the normal client app
graph still owns execution. This is graph/hydration ownership, not
serialization of the universal host tree. Raw Rspack proves the graph split and
reference metadata. Vite and Rsbuild own the application hydration lifecycle
and prove that the existing DOM shell is adopted while exactly one client
region is mounted.

## 4. Compiler contract

The experimental direct-compiler inputs are:

```ts
interface CompilerRendererDescriptor {
	readonly id: string;
	readonly module: string;
	readonly target: 'dom' | 'universal';
	readonly server: 'render' | 'client-only' | 'unsupported';
	readonly intrinsics?: string;
	readonly text: 'reject' | 'ignore' | 'host';
	readonly capabilities: readonly string[];
}

interface CompilerRendererBoundary {
	readonly ownerRenderer: string;
	readonly childRenderer: string;
	readonly prop: string;
	readonly server?: 'omit-child';
}

compile(source, filename, {
	mode: 'client',
	renderer: descriptor,
	rendererBoundaries: normalizedConfig.boundaries,
	rendererRegistry: normalizedConfig.registry,
});
```

Adapters pass `renderer` only for a non-DOM selection. Omitting it follows the
exact pre-existing DOM branch. Passing the built-in DOM descriptor must not be
used as an excuse to rewrite the normal DOM path. Direct compilation passes the
normalized boundary table and registry together whenever a module may contain
an explicitly renderer-owned prop; omitting both retains the byte-identical
no-boundary path.

For a universal descriptor, the compiler:

1. runs the shared TSRX parsing, type erasure, hook-slot, dependency, and
   component analysis that is host independent;
2. lowers host JSX into immutable `host`, `range`, `text`, and `slot` plan
   records while emitting component, props, children, directive, context, and
   keyed-value records for dynamic topology;
3. hoists static host structure once per module and gives each local/imported
   component a stable compiled identity;
4. emits current dynamic expressions as a compact values vector;
5. wraps compiled components with renderer identity metadata and normal
   hook-owner semantics;
6. preserves the normal dependency inference, HMR dialect, profiling metadata,
   and parallel-`use()` warm plans;
7. imports the internal universal ABI from the selected renderer module ID.

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
in the plan; only its dynamic slots are reevaluated. Nested components are
compiler-emitted component records, and render bodies are stable child-region
records. Keyed template control flow uses explicit keys and produces logical
ranges when an item has more than one root.

The selected renderer module is expected to provide the compiler ABI helpers,
normally by re-exporting the experimental universal core alongside
renderer-specific entry points. Universal lowering runs the resulting
JSX-free module through the existing client hook/dependency transform and then
retargets only universal runtime imports to the selected renderer module. DOM
helpers intentionally remain imported from `octane` when a reverse renderer
region contains DOM code. A universal renderer module must re-export the
universal hook/runtime and plan ABI used by the source. The compiler does not
load the renderer module during configuration or compilation. This keeps
configuration cacheable and lets a renderer package define its intrinsic
TypeScript surface without installing a compiler plugin callback.

The lowering is fail-closed. Before the second pass, the compiler proves that
no unowned JSX/TSRX remains in setup statements, dynamic expressions, arrow
functions, or other module declarations. It also validates named `octane`
runtime imports against the universal runtime. Unsupported JSX or hooks
diagnose at the original source location; they can never be erased by the DOM
compiler or turn into an accidental DOM fallback.

### Implemented client syntax

The executable universal target accepts normal Octane component composition:

- local and imported function components, props, render-body children,
  fragments, arrays, null, primitives, and legal early/non-JSX returns;
- ordered host and component spreads, including later-property precedence,
  `children`, `key`, `ref`, `undefined` removal, and callback replacement;
- `@if`/`@else`, `@switch`/`@case`/`@default`, keyed `@for` with `@empty`, and
  `@try`/`@pending`/`@catch`;
- compiler-assigned hook slots, inferred dependencies, context
  Providers/consumers, refs, insertion/layout/passive effects, suspension,
  error ownership, HMR, profiling, and parallel-`use()` planning;
- `<Activity mode="visible"|"hidden">` when the selected renderer declares
  `visibility`, with retained hosts and renderer-owned effect/event semantics.

Scoped `<style>`, general portals, async template collections, and live
universal server output remain capability gaps and diagnose rather than
silently changing targets. Static authored text follows the selected
descriptor's `host`/`ignore`/`reject` policy; dynamic primitive materialization
is checked again against the active driver. Renderer-specific host/property
validation belongs to renderer capability metadata or the driver, not to DOM
attribute, class, or style rules in the universal core.

Volar prepends a file-local `@jsxImportSource` pragma only when the selected
descriptor declares `intrinsics`. Its mappings are shifted back to authored
TSRX offsets, so DOM and non-DOM files can assign conflicting types to names
such as `line`, `path`, `audio`, and `source`. Renderer-local module
augmentation extends only that renderer's catalogue; it does not merge into a
process-global intrinsic namespace.

Universal source maps compose the lowered intermediate map back to the
original TSRX source. Boundary lowering likewise preserves the authored file
as `sourcesContent`, including when a universal-to-DOM region needs a second
DOM compilation pass.

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

The types live under the experimental `octane/universal` subpath. They are
exported so the object driver and renderer packages can be implemented, but
they are not yet a compatibility promise.

### Immutable plan

```ts
type UniversalPlanNode =
	| {
			readonly kind: 'host';
			readonly type: string;
			readonly props?: Readonly<Record<string, unknown>>;
			readonly bindings?: readonly (readonly [name: string, slot: number])[];
			readonly propsSlot?: number;
			readonly children?: readonly UniversalPlanNode[];
	  }
	| { readonly kind: 'text'; readonly value?: string; readonly slot?: number }
	| { readonly kind: 'slot'; readonly slot: number }
	| { readonly kind: 'range'; readonly children: readonly UniversalPlanNode[] }
	| {
			readonly kind: 'component';
			readonly renderer: string;
			readonly component?: UniversalComponent;
			readonly componentSlot?: number;
			readonly propsSlot?: number;
			readonly keySlot?: number;
			readonly children?: readonly UniversalPlanNode[];
	  }
	| {
			readonly kind: 'if';
			readonly conditionSlot: number;
			readonly then: UniversalPlanNode;
			readonly else?: UniversalPlanNode;
	  }
	| {
			readonly kind: 'switch';
			readonly valueSlot: number;
			readonly cases: readonly (readonly [unknown, UniversalPlanNode])[];
			readonly default?: UniversalPlanNode;
	  };

interface UniversalPlan {
	readonly renderer: string;
	readonly root: UniversalPlanNode;
}
```

`host` is a renderer intrinsic, not necessarily a node. `range` is logical and
never reaches a driver as a comment or fragment. `slot` may materialize a
primitive, another plan value, a nested component, a keyed list, an array, or
emptiness. Dynamic records implement component props/children, conditional
branches, keyed loops, try/pending/catch ownership, and Providers without
turning the template back into JSX. Plan construction validates and freezes
static records so a renderer cannot observe a half-mutated plan.

### Logical records

Each universal root owns records with a core ID, key, kind, host type/props,
logical parent, and ordered logical children. Range records have no physical
host instance. Flattening a range yields its physical host descendants only
when commands are planned for a concrete parent.

This topology provides three things a driver must not emulate:

- the before-position for insertion or movement through a marker-free range;
- survivor identity for keyed multi-root values;
- the committed baseline against which an uncommitted draft is reconciled.

A keyed range reorder reuses records and nested component owners when key,
record kind, host type, and component identity are compatible. It may emit
explicit `move` commands, but it never deletes and recreates a surviving host
or hook owner merely because a sibling range moved. Correct final order and
survivor public-instance/hook identity are guaranteed.

### Driver and commands

The deliberately small driver surface is DOM-like in vocabulary, not in data
model:

```ts
type UniversalHostCommand =
	| { op: 'create'; id: number; type: string; props: Readonly<Record<string, unknown>> }
	| { op: 'update'; id: number; props: Readonly<Record<string, unknown>> }
	| { op: 'recreate'; id: number; type: string; props: Readonly<Record<string, unknown>> }
	| { op: 'insert' | 'move'; parent: number | null; id: number; before: number | null }
	| {
			op: 'event';
			id: number;
			type: string;
			listener: { id: number; priority: 'discrete' | 'continuous' | 'default' } | null;
	  }
	| {
			op: 'lifecycle' | 'local-callback';
			id: number;
			type: string;
			listener: { id: number } | null;
	  }
	| { op: 'visibility'; id: number; state: 'hidden' | 'visible' }
	| { op: 'remove'; parent: number | null; id: number }
	| { op: 'destroy'; id: number };

interface UniversalHostBatch {
	readonly renderer: string;
	readonly version: number;
	readonly commands: readonly UniversalHostCommand[];
}

interface UniversalHostDriver<Container, PublicInstance> {
	readonly id: string;
	readonly capabilities?: {
		readonly text?: 'reject' | 'ignore' | 'host';
		readonly localHostCallbacks?: boolean;
		readonly visibility?: boolean;
	};
	readonly events?: {
		classify(name: string): {
			type: string;
			priority?: 'discrete' | 'continuous' | 'default';
		} | null;
	};
	readonly updates?: {
		classify(type: string, previous: object, next: object): 'update' | 'recreate';
	};
	prepareBatch(
		container: Container,
		batch: UniversalHostBatch,
		context: UniversalHostCommitContext,
	): UniversalPreparedHostBatch;
	getPublicInstance(container: Container, id: number): PublicInstance | null;
}

interface UniversalPreparedHostBatch {
	apply(): void;
	afterAccept?(): void;
	abort(): void;
}

interface UniversalHostCommitContext {
	invokeLocalCallback(listener: number, args: readonly unknown[]): unknown;
}
```

`parent: null` means the root container. IDs and `before` references name
core records, not driver object identity. `remove` detaches a live instance;
`destroy` releases its renderer-owned resources. `recreate` keeps the core ID
and logical children while replacing the public instance, transferring final
placement, callback/ref ownership, and disposal in one accepted commit.
`visibility` changes physical presentation without deleting logical ownership.

`version` is a monotonic prepared-batch sequence, so aborted attempts may leave
gaps in the versions observed by a driver. Drivers order accepted batches by
their increasing values and must not interpret a gap as a missing commit.

`prepareBatch()` validates and may stage host resources without mutating the
public host. It returns an abortable token. `apply()` is the acceptance point;
after it begins, a thrown error is an accepted commit fault rather than a
rejected preparation. `abort()` releases unpublished staged ownership exactly
once. `afterAccept()` is the only phase in which a local driver may invoke
classified function-valued callbacks through the core-owned listener table.

Events are an explicit optional driver capability. `classify()` decides which
prop names are renderer events, supplies the renderer-facing type and priority,
and leaves every other callback/property under ordinary prop semantics. The
core emits listener IDs and priority metadata in `event` commands; handlers
themselves remain on the logical owner. Update, replacement, removal, and host
teardown all update the registry transactionally. An in-process driver can
dispatch the ID synchronously against the committed public instance, while a
future transport can serialize the descriptor and return that ID with its
native payload. This is not DOM delegation and does not create a React
synthetic-event layer.

One platform event may call `root.eventScope(priority, fn)` to pin the accepted
listener table while it delivers target, ancestor, hover, or missed listener
IDs. Nested scopes must keep the same priority, and scheduled work flushes once
when the outer scope closes.

Host props pass through a codec as serializable values, root-scoped resource
handles, or explicit unsupported results. Event, lifecycle, and local-callback
functions become listener IDs rather than entering a batch. Styles, asset
loading, layout, and specialized collection attachment remain optional
extensions rather than mandatory methods every driver must fake.

### Root transaction

```ts
interface UniversalRoot<P> {
	readonly renderer: string;
	prepare(component: UniversalComponent<P>, props: P): UniversalPreparedAttempt;
	render(component: UniversalComponent<P>, props: P): UniversalPreparedAttempt;
	eventScope<T>(priority: UniversalEventPriority, run: () => T): T;
	dispatchEvent(listener: number, payload: unknown): unknown;
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

It then asks the driver/transport to prepare the immutable batch. This may
allocate unpublished host resources, but it cannot mutate the public host.
Suspension returns a suspended attempt and retains the last committed topology.
A thrown render error discards the draft. A newer prepare aborts the older
prepared transaction. Explicit abort discards all staged work and invokes the
prepared token's abort path, so all three paths produce zero visible host
mutation and zero leaked staged instances.

A successful commit has this phase ordering:

1. exactly one prepared token `apply()` acceptance;
2. publish logical topology, listener ownership, and committed hook state;
3. invoke `afterAccept()` local callbacks;
4. insertion-effect cleanups and creates;
5. layout-effect cleanups and old ref detach work;
6. deliver host lifecycles after final placement;
7. public ref attaches and layout-effect creates;
8. passive cleanups followed by passive creates in a later microtask if the
   hook/root is still current.

Pending passive work is flushed before the next universal render attempt. This
keeps two same-turn commits distinct instead of dropping or merging the first
commit's passive phase. Cleanup walks retain the previous render's declaration
order even when removed hooks and dependency-changed hooks share a phase.

Within the host batch, the core orders creates/updates/recreates, callback and
event descriptors, detach/removes, placements (`insert`/`move`), descendant-
first hides, ancestor-first reveals, and final destroys so every referenced
instance exists before placement and no destroyed instance remains attached.

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
	prepareBatch(
		container: Container,
		batch: UniversalHostBatch,
		prepareLocally: (batch: UniversalHostBatch) => UniversalPreparedHostBatch,
	): UniversalPreparedHostBatch;
}
```

Three can omit a transport and mutate its scene graph synchronously. A future
Lynx driver may serialize the ordered batch, coalesce platform messages, or
hand it to another thread. The proving transport must preserve the same
prepare/apply/abort token. The current interface is still synchronous from the
core's perspective: it has no asynchronous acknowledgement or layout-read
protocol. A cross-thread renderer must map remote validation and acknowledgement
to this acceptance boundary before it can claim layout effects or commit-
failure recovery.

## 6. Nested owners and renderer identity

Every compiled nested function component has its own universal owner record.
That owner holds compiler-assigned hook cells, context ancestry, error and
pending ownership, refs, insertion/layout/passive effects, suspended retry
subscriptions, and keyed identity. Component render bodies and Providers are
logical ranges rather than physical driver hosts. Deleting or replacing a
subtree disposes owners deterministically; reordering compatible keyed
component ranges preserves the owner, hook state, and public host instances.

Hook mutations use transaction-local copy-on-write state. A suspended, thrown,
superseded, or explicitly aborted attempt cannot publish draft hook cells,
effect/ref work, event handlers, or host allocation. `@try` owns sticky caught
state and a reset callback, and `@pending` may retain the prior committed range
while a retry is pending. Context Providers and consumers work between
universal owners and inherit a bridged DOM ancestry when entered through a DOM
boundary.

Visibility is inherited through owner records. Hidden Activity and retained
Suspense hosts keep logical/public identity, resources, state, and insertion
effects while layout/passive effects and event delivery disconnect. Activity
keeps refs attached; retained Suspense cycles refs through null and reattaches
the same public instance on reveal. A fallback is a coexisting visible owner,
not a replacement for the hidden primary, and repeated pending renders cannot
duplicate either range. Host visibility commands are capability-gated and
transactional, so an aborted or rejected transition leaves the accepted tree
unchanged.

The universal runtime preserves Octane's compiler-assigned slot model,
dependency inference, current-state getter, and parallel-`use()` behavior.
Transition/deferred/action/form compatibility APIs currently execute without a
separate lane scheduler, and `memo` does not yet provide a render bailout;
those timing/optimization gaps do not weaken transactional ownership.

Renderer identity is explicit at every durable boundary:

- resolved config yields renderer/module/target plus server, text, intrinsic,
  and capability metadata for a filename;
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

The universal runtime does not yet implement transition lanes. Its
`startTransition` behavior is synchronous, so it makes no timing parity claim.
The scheduler expansion must carry the root owner and renderer
identity on queued transition work exactly as urgent updates do; introducing a
mutable renderer switch is not an option.

## 7. Explicit mixed-renderer boundaries

File rules select a lexical default; they do not implicitly reinterpret an
arbitrary child. Switching renderer is an explicit boundary owned by a
renderer package. The implemented package-facing authoring form is:

```tsx
<Canvas>
	<Scene />
	<mesh />
	<Html>
		<button>DOM overlay</button>
	</Html>
</Canvas>
```

Here `Canvas.children` is declared as `dom -> three`, and `Html.children` is a
separate `three -> dom` boundary. The declarations live in normalized compiler
configuration under stable module/export identities. The static analyzer
resolves default, named, aliased, and namespace imports, respects lexical
shadowing and type-only imports, and lowers only the declared prop. This is
package/module metadata, not ancestry guessing, bundler-private metadata, or a
mutable runtime renderer switch.

A concrete `Canvas` component owns and creates its renderer root, so application
authors do not pass a low-level root prop in this form. The executable object
proof uses exactly this wrapper shape. `createUniversalHostBoundary(renderer)`
is the lower-level primitive used inside that wrapper and deliberately accepts
an already-created root so a real renderer package controls its container,
driver, and resource lifetime.

For example:

```ts
compiler: {
	renderers: {
		boundaries: {
			'@octanejs/three': {
				Canvas: {
					ownerRenderer: 'dom',
					childRenderer: 'three',
					prop: 'children',
					server: 'omit-child',
				},
				Html: { ownerRenderer: 'three', childRenderer: 'dom', prop: 'children' },
			},
		},
	},
}
```

Ordinary JSX precedence still applies. An explicit boundary prop after a
spread is representable and wins. A later spread that could replace the
renderer-owned prop is rejected with a source diagnostic; the compiler does
not guess at runtime. Nested declared boundaries are independently lowered by
their owning renderer.

The compiler replaces each region with an opaque stable descriptor:

```ts
interface RendererRegion<P> {
	readonly ownerRenderer: string;
	readonly childRenderer: string;
	readonly component: unknown;
	readonly props: P;
}
```

`rendererRegion(owner, child, component, props)` validates that the identities
are distinct and that the child body is executable. The compiler keeps the
component stable and puts render-time captures in `props`, so an owner update
does not reset the child tree. For DOM-to-universal regions it emits a
universal plan/component directly. For universal-to-DOM regions it reserves
the explicit region during universal lowering, then runs that region alone
through the normal DOM compiler. This shared descriptor is the mechanism from
which both `Canvas` and a future concrete `Html` host follow; no tag name is
hard-coded.

`createUniversalHostBoundary(renderer)` exposes runtime metadata with this
shape:

```ts
interface UniversalBoundaryMetadata {
	readonly id: string;
	readonly ownerRenderer: string;
	readonly childRenderer: string;
	readonly childrenProp: string;
}
```

The experimental DOM boundary receives an already-created universal root and
the compiler-owned region in `children` (the direct `component`/`props` form is
also available to low-level callers). It is an ordinary void DOM component:

1. render calls `root.prepare()` and therefore performs no host mutation;
2. it reads parent context through the existing DOM `useContext` owner;
3. it commits the prepared transaction from the boundary's existing DOM layout
   effect, so an abandoned DOM render never commits the object host;
4. render errors thrown by the universal component continue through the
   surrounding DOM error route;
5. universal refs attach and universal layout effects run inside that boundary
   layout commit, before later ancestor layout effects;
6. boundary cleanup unbridges and unmounts the universal root.

Because the DOM boundary intentionally adds no `Block` rollback field, it
installs a same-turn abandonment guard for each prepared or suspended attempt.
A successful synchronous DOM layout commit disarms the guard. If a later
sibling throws and that layout commit never occurs, the guard aborts the
attempt and releases initial root ownership before an async retry can mutate
the object host. A future concurrent/off-screen boundary protocol should
replace this guard with explicit DOM WIP rollback registration.

No `Block` field, `BlockKind`, fake node, marker, or DOM plan change is needed.
Universal state updates call the captured boundary invalidator, which schedules
the existing owning DOM scope and prepares the next external transaction.

On suspension, the boundary keeps the previously committed external host tree
(or an empty tree on initial mount), commits nothing, and schedules the
boundary owner after settlement. It does not yet project universal suspension
into the parent DOM `@pending` UI or inherit DOM transition-hold timing. That
is a separate boundary protocol gate. Likewise, wrapping the DOM boundary in a
DOM `<Activity>` does not yet propagate inherited visibility into the external
root; portable Activity inside the universal renderer is implemented, while
cross-boundary offscreen ownership remains a Three integration gate.

Parent context, error ownership, suspension retry, and deterministic teardown
remain attached to the component owners on both sides. A universal root under
the DOM boundary reads an enclosing DOM Provider and routes synchronous render
errors to its enclosing DOM owner; nested universal Providers and
`@try`/`@pending` owners operate inside the region. The reverse descriptor
contains a normally compiled DOM component that a renderer-owned `Html`
implementation can mount into its concrete DOM container while preserving the
universal owner that supplied it.

Live universal host serialization and adoption remain unsupported. A renderer
with `server: "unsupported"` still fails rather than compiling as DOM. A
`client-only` renderer instead preserves exports through an inert server stub,
omits its declared child region from the DOM SSR body, and links the shell to a
single client-region client graph while recording stable manifest identity.

## 8. Object renderer proof

The object driver is an executable protocol probe, not a proposed application
renderer. Its container holds an ordered root `children` array, a map of public
instances, and the committed batches. Each public instance has a stable core
ID, type, props, and ordered child array.

Before touching the live container, the driver simulates and validates every
command against copied IDs/relationships. Only a valid full batch is applied,
then recorded once. This proves the atomic driver contract without DOM nodes.

The object driver and executable fixtures demonstrate:

- initial create and insert;
- props update without identity replacement;
- public-instance recreation under a stable logical ID, with child transfer,
  old/new ref churn, local callback cleanup/setup, and post-placement lifecycle;
- insertion before an existing sibling;
- keyed movement, including a multi-root logical range, with survivor object
  identity and nested component hook ownership preserved;
- local and imported nested components, props/children, spreads, every normal
  template directive, Providers/consumers, early returns, errors, and retained
  suspension;
- remove followed by resource destroy;
- public callback/object ref attachment after commit and detachment on change
  or teardown;
- insertion/layout/passive effect ordering around the batch;
- prepared-token abort, render error, and suspension with no public mutation
  and exact staged-resource release;
- a live allocated-instance count that remains unchanged across abandoned
  attempts;
- event classification, registration, replacement, removal, dispatch against a
  committed public instance, nested delivery scopes, priority metadata, and
  teardown;
- Activity and retained Suspense visibility with host/state identity,
  capability failure, ref/effect/event behavior, fallback coexistence, reveal,
  rejection, and aborted/rejected transactions;
- one recorded batch for each successful root commit and one teardown batch.

Text is represented as a `#text` host only because the object driver declares a
text capability. Materialization rejects a driver that has not opted into that
capability. The spelling is an internal convention for this proof, not a
requirement that Three or Lynx allocate text nodes.

## 9. Optional capabilities and extensions

The core protocol is intentionally smaller than a browser. A renderer must
declare, implement, or reject these independently.

| Capability | Implemented behavior | Remaining contract gate |
| --- | --- | --- |
| Text | Registry and driver policies independently choose `host`, `ignore`, or `reject`; static authored text diagnoses at compile time and dynamic primitives fail at materialization when unsupported. | A concrete renderer defines whether and how it allocates/updates text hosts. |
| Events | Driver classification lowers event props to listener-ID/priority commands; replacement, removal, teardown, owner-routed dispatch, and scoped multi-listener delivery are transactional. | A Three driver must classify its ray/pointer surface; a transported renderer must serialize native delivery/priority semantics. There is deliberately no synthetic event layer. |
| Styles | No renderer-neutral style object or stylesheet lifecycle. | Add typed renderer extensions for material/style application and disposal; do not copy CSS rules into native renderers. |
| Assets | No prepare-time asset allocation. | Add cancellable/resource-owned capabilities whose acquisition is staged or externally cached. |
| Visibility / `Activity` | Core-owned Activity and retained Suspense issue capability-gated visibility commands, retain identity/resources/insertion effects, disconnect events and layout/passive effects, and apply their distinct ref contracts. | Three maps visibility onto `Object3D.visible` versus attachment/resource detachment; DOM-owner Activity and Three-to-DOM pending projection remain Milestone 5. |
| Portal | `createPortal` fails clearly; the same-renderer target-handle, logical/physical ownership, root/transport scope, and event-enclave contract is specified by the Three port plan. | Implement and validate the Three capability without treating renderer regions as portals. |
| Hydration / serialization | Client-only renderers preserve server exports, omit declared regions, and expose stable manifest identity for one client mount without serializing the host tree. | A live renderer serializer/adopter must define seed identity and mismatch behavior separately; absence remains valid. |
| Layout measurement | Public instances are available after commit; there is no neutral measure call. | Define synchronous-local versus transport-acknowledged layout and the point at which layout effects may run. |
| Specialized collections | Not forced into generic child insertion. | Add renderer-namespaced commands/capabilities for Three `attach`, render lists, native collections, or other ownership models. |

The serializable descriptor capabilities are compiler/tooling metadata; driver
capabilities are independently checked at the owning root. The compiler now
fails closed for Activity and authored text when statically knowable, while the
prop codec and driver catch runtime values. It still cannot prove every
renderer-specific host type or property. Unsupported cases must produce a
renderer-naming diagnostic, never a DOM interpretation.

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
6. Preparing a render may stage through `prepareBatch`, but cannot mutate the
   public host or run user ref/effect/lifecycle/local-callback commit work.
7. Suspension, render error, supersession, explicit abort, and rejected
   preparation commit zero host commands and release every unpublished staged
   resource exactly once.
8. Every successful universal commit reaches the host as one ordered batch.
9. The committed logical topology advances only with the accepted batch.
10. Reordering a keyed range preserves compatible survivor host identity and
    produces the requested final order without physical comment markers.
11. Public refs attach only after their instances exist, detach only after the
    replacement/removal batch is accepted and before any replacement ref
    attaches, and never observe an abandoned draft.
12. A mixed boundary reads context and routes render errors through its owning
    DOM scope; its host commit is gated by that scope's layout commit.
13. Renderer events become visible only with their accepted host batch;
    replacement, removal, teardown, and abandoned attempts cannot leave stale
    dispatchable listeners.
14. Renderer-owned child regions are selected from stable module/export
    metadata and carry explicit owner/child identities in both directions.
15. Unsupported browser/native concepts are capability failures, not methods
    every driver must fake.
16. A client-only module's authored server setup never executes; its stable
    client reference matches across adapters, and only an explicitly omitted
    boundary region may consume its exports in a server owner.

## 11. Validation gates

The implementation is maintained with focused executable tests at these
observation boundaries:

| Gate | Required evidence |
| --- | --- |
| DOM isolation | Existing DOM compiler goldens are byte-equal when renderer config is omitted or resolves to `dom`. Existing DOM runtime tests remain unchanged. |
| Direct compiler selection | The same source emits DOM output for `dom`, universal helper imports/plan output for a universal descriptor, rejects unsupported server mode, and produces an inert export-preserving stub for client-only mode. |
| Shared config | Normalization, first-match/exclude behavior, server/text/intrinsic/capability metadata, path canonicalization, and stable signatures are tested without a bundler. |
| Adapter parity | Direct bundler compiler, Vite, Rspack loader/plugin, and Rsbuild choose the same descriptor for the same normalized config and canonical filename. |
| Logical ranges | A keyed multi-root range reorders without marker hosts and preserves public-instance identity. |
| Component ownership | Local/imported nested components, hooks, Providers, errors, suspension, refs, and effects retain/dispose the correct keyed owner. |
| Template composition | Host/component spreads, early returns, fragments, arrays/primitives, and every supported directive execute without runtime JSX. |
| Atomic attempts | Suspension, render error, superseded prepare, explicit abort, and rejected host preparation leave the accepted tree, commits, refs, effects, and committed-resource ownership unchanged; staged resources abort once. |
| Batch boundary | Each successful render contributes exactly one ordered batch; teardown contributes one final batch when hosts exist. |
| Mutation vocabulary | Create/update/recreate/insert/move/visibility/remove/destroy plus listener/lifecycle/local-callback descriptors are exercised through the object driver's public tree. |
| Identity diagnostics | Component/plan/root/boundary/container/driver mismatches fail with both expected and received renderer IDs in development. |
| Mixed ownership | A DOM parent provides context to an object child; child render errors reach the DOM error owner; ref and effect ordering straddle the single object commit correctly; DOM unmount tears the external root down. |
| Renderer regions | Imported aliases and stable module/export metadata lower `Canvas`-shaped DOM-to-universal children and `Html`-shaped universal-to-DOM children through the same descriptor mechanism. |
| Events | Registration, replacement, removal, scoped multi-listener dispatch, priority, teardown, and abandoned work are observable on the object driver's public surface. |
| Retained ownership | Activity and Suspense prove host/state/resource identity, visibility, distinct ref semantics, insertion retention, layout/passive disconnection, event suppression, fallback coexistence, reveal/reject, and capability failure. |
| Client-only graph | Neutral, Vite, Rspack, and Rsbuild builds remove server imports/regions, preserve exports without authored execution, reject live use, and agree on client-reference/manifest identity; raw Rspack proves graph split and Vite/Rsbuild prove one client mount over an adopted DOM shell. |
| Compiler facilities | Universal maps point to authored TSRX; HMR, profiling, and parallel-`use()` plans remain executable; Volar chooses file-local intrinsics without global merging; the DOM golden stays byte-identical. |
| Capability gates | Text and Activity/visibility compile and execute only under explicit policies; portals and every unsupported renderer concept fail clearly. |

Repository-wide typechecking and formatting remain required after the focused
compiler/runtime/adapter suites. A user-facing experimental config or package
export receives a patch changeset even though the ABI is not stable.

## 12. Migration phases

### Implemented foundation, composition, and renderer-SDK slice

The shared resolver, compile-option plumbing, nested universal owner graph,
static-plan and directive lowering, transactional root, event descriptor
protocol, prepared host acceptance, object driver, and renderer-region lowering
are implemented. Normal
componentized client authoring—including `Canvas`-shaped DOM-to-universal and
`Html`-shaped reverse child regions—is executable rather than an RFC-only
design. Stable-ID recreation, host lifecycle/local callbacks, prop codecs,
event scopes, retained visibility, client-only server graphs/manifests, and
file-local intrinsic catalogues are executable. Universal maps compose to TSRX,
the high-level Vite plugin loads the same renderer config early, and the
Vite/Rspack/Rsbuild paths share normalized target and boundary decisions.

The remaining foundation limitations are capability/scheduler boundaries:

- live universal host serialization/adoption, general portals, async template
  collections, scoped styles, neutral layout measurement, and asynchronous
  transport acknowledgement are not implemented;
- mixed-boundary suspension retains committed external content but does not yet
  drive the parent renderer's fallback or transition-hold timing, and a DOM
  Activity does not yet propagate offscreen state into an external root;
- transition/deferred/action/form compatibility behavior has no universal lane
  scheduler, and `memo` has no universal bailout optimization;
- a reverse renderer region contains executable normally compiled DOM content,
  but a real `Html` package still owns its physical DOM container and mounting
  lifecycle;
- the driver/plan/helper/event/boundary ABI remains experimental until real
  renderer and transport implementations validate disposal, attachment, frame
  scheduling, and delivery semantics.

### Next: `@octanejs/three` proving renderer

Build the smallest real Three package on the implemented seam:

The R3F compatibility target, ABI gates, implementation phases, effort, and
validation matrix are tracked in [`three-port-plan.md`](./three-port-plan.md).

- a typed Three intrinsic catalog and concrete `Canvas` root/container;
- Three object creation, prop application/diffing, insert/move/remove, disposal,
  and public instances;
- renderer-specific `attach`/collection ownership rather than encoding it as
  fake children;
- frame invalidation and layout/effect timing;
- classification and delivery of Three ray/pointer events through the universal
  event capability;
- asset/Suspense ownership and Three portals if justified;
- a concrete `Html` host that mounts the compiled reverse DOM region into its
  owned DOM container and tears it down deterministically.

Only after a real Three proof should helper names, driver extensions, or
boundary authoring APIs be considered for a stable public renderer SDK.

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
portable contract emerges, devtools, and any justified shared hook
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
implementation adopts. Its small DOM-shaped operation set is not sufficient verbatim for
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

The implemented boundary proves that sharing context/error/effect ownership does
not require sharing host records. If later measurements show a scheduler or
hook cell can be reused safely, it can be extracted after evidence from two
renderers; the DOM representation itself remains specialized.

## 14. Decision checkpoints before publishing

The published experimental contract remains unstable until all of these have
evidence:

- Three validates host creation, disposal, special attachment, events, layout,
  assets, and renderer-owned children without fake nodes;
- a transported renderer validates batch serialization and acknowledgement;
- concrete Three `Canvas` and `Html` packages validate physical container and
  resource ownership on both already-compiled boundary directions;
- transition and Suspense semantics are specified across a boundary;
- capability diagnostics are usable from the compiler and language tooling;
- DOM byte size and performance remain unaffected;
- two renderer implementations agree that the core driver surface is the
  minimum rather than an object-driver artifact.

Until then, config types, `octane/universal`, boundary metadata, helper imports,
plan records, command ordering, and capability names may change in patch
releases. The current architectural commitment is template-level selection,
explicit renderer identity, core-owned logical topology, staged one-batch
commit, and an untouched optimized DOM path.

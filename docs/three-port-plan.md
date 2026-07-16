# `@octanejs/three` — React Three Fiber 9 web port plan

Port the stable web/core behavior of React Three Fiber (R3F) to Octane's
universal renderer as `@octanejs/three`. The target is R3F
[v9.6.1](https://github.com/pmndrs/react-three-fiber/releases/tag/v9.6.1),
commit `2a528745`, audited 2026-07-15. R3F 10 is still a prerelease and changes
the renderer state, scheduler, and WebGPU surface, so it is design input rather
than the compatibility baseline.

The strategy is not to port React Reconciler. Octane already owns component
execution, hooks, context, errors, Suspense, logical ranges, refs, and effects.
This package supplies the Three-specific host driver, root state, frame loop,
events, assets, types, and DOM `Canvas` boundary. The implementation should
reuse R3F's framework-neutral algorithms under its MIT license while replacing
every React/Fiber ownership mechanism.

## Decision summary

- Preserve the useful R3F v9 web API and observable Three behavior: `Canvas`,
  `createRoot`, `extend`, Three intrinsics, `primitive`, `useThree`, `useFrame`,
  `useLoader`, frame controls, pointer events, portals, attachment, and
  disposal.
- Compile scene modules with the existing universal target. Keep DOM as the
  application default and select Three lexically, conventionally with
  `*.three.tsrx`.
- Use the compiler-owned `Canvas.children` region for DOM -> Three composition.
  Do not copy R3F's second-Reconciler context bridge, `its-fine`, error boundary,
  or Suspense blocking machinery.
- Keep the universal core renderer-agnostic. The first work closes a small set
  of general ABI gaps exposed by Three: public-instance replacement, host
  lifecycle delivery, visibility, client-only server boundaries, and portals.
- Treat R3F v9 web/core parity as the release target. React Native/Expo, R3F 10
  WebGPU/TSL APIs, and Drei are separate programs. In particular, `Html` is a
  Drei component, not an R3F core export.

## Authoring and package shape

The normal application stays a DOM application and explicitly crosses into a
Three scene:

```ts
// octane.config.ts
import { defineConfig } from '@octanejs/vite-plugin';

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
			},
			rules: [{ include: 'src/**/*.three.tsrx', renderer: 'three' }],
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

`server`, `intrinsics`, `text`, and `capabilities` are normalized renderer
descriptor fields supplied by the Milestone 1 SDK. The eventual
`@octanejs/three/config` export supplies this serializable descriptor/boundary
data. A Vite app installs
`octane()` separately in `vite.config.ts`; an Rsbuild app imports `defineConfig`
from `@octanejs/rsbuild-plugin` instead. The low-level Rspack plugin receives the
same renderer data through its `renderers` option, but it owns compilation/HMR
only—not the app SSR/hydration lifecycle supplied by Vite and Rsbuild.

```tsx
// App.tsrx — DOM renderer
import { Canvas } from '@octanejs/three';
import { Scene } from './Scene.three.tsrx';

export function App() @{
	<Canvas frameloop="demand">
		<Scene />
	</Canvas>
}
```

```tsx
// Scene.three.tsrx — Three renderer
import { useFrame } from '@octanejs/three';

export function Scene() @{
	let mesh;
	useFrame((_state, delta) => (mesh.rotation.x += delta));
	<mesh ref={(value) => (mesh = value)} position={[0, 0, 0]}>
		<boxGeometry args={[1, 1, 1]} />
		<meshStandardMaterial color="hotpink" />
	</mesh>
}
```

The proposed package layout is:

```text
packages/three/
  src/index.ts                 public web/core API
  src/renderer.ts              compiler target; re-exports octane/universal ABI
  src/config.ts                serializable registry/boundary preset
  src/intrinsics.ts            renderer-specific TSRX types/capabilities
  src/core/{catalogue,driver,props,attach,store,loop,events,hooks}.ts
  src/web/{Canvas.tsrx,events,measure}.ts
  tests/{driver,root,hooks,events,canvas,ssr,differential}/
  typetests/
  README.md
  status.json
```

`@octanejs/three/renderer` is an implementation-facing compiler target, not a
second authoring API. It re-exports the universal plan/runtime helpers because
compiled Three modules import their Octane ABI from the selected renderer
module. `@octanejs/three` and `@octanejs/three/core` expose the supported
R3F-shaped APIs. `@octanejs/three/config` exports the registry and boundary
metadata as serializable data so Vite, Rspack, and Rsbuild do not duplicate
package knowledge; each integration still places that shared data in its
documented option surface. The package manifest marks its custom hooks for
manual Octane hook-slot forwarding.

Published package internals that contain Three host syntax are precompiled with
the Three descriptor. Consumer filename rules select application scene files;
they must not be responsible for correctly classifying files inside
`node_modules`, nor may a consumer's default renderer reinterpret package
internals.

Programmatic roots follow Octane's existing root convention:
`root.render(Component, props)`. We should not manufacture React element
descriptors merely to copy R3F's `root.render(element)` signature. `Canvas` is
the source-compatible path used by most applications.

## Upstream seam and reuse map

The v9.6.1 web/core is about 3.4k source lines. The boundary is favorable:

| Upstream area | Octane treatment |
| --- | --- |
| [`three-types.ts`](https://github.com/pmndrs/react-three-fiber/blob/v9.6.1/packages/fiber/src/three-types.ts) | Adapt the math shorthands, event-gated props, `ThreeElements`, `primitive`, and DOM-name conflict aliases. Replace React JSX/ref types and add TSRX language/type evidence. |
| [`reconciler.tsx`](https://github.com/pmndrs/react-three-fiber/blob/v9.6.1/packages/fiber/src/core/reconciler.tsx) | Replace the React Reconciler shell. Port catalogue lookup, validation, reconstruction, visibility, ordering, attachment, disposal, and interaction-transfer algorithms into the universal driver. |
| [`utils.tsx`](https://github.com/pmndrs/react-three-fiber/blob/v9.6.1/packages/fiber/src/core/utils.tsx) | High reuse: property resolution, diff/apply, color/math setters, stable shader uniforms, graph building, camera updates, and disposal. Remove React bridge/error/hook helpers. |
| [`store.ts`](https://github.com/pmndrs/react-three-fiber/blob/v9.6.1/packages/fiber/src/core/store.ts) | Preserve the public root-state contract using `zustand/vanilla`. Build a Three-renderer-native callable store hook on universal `useSyncExternalStore`, including selector/equality behavior; neither the React nor DOM-Octane Zustand binding is renderer-neutral. |
| [`renderer.tsx`](https://github.com/pmndrs/react-three-fiber/blob/v9.6.1/packages/fiber/src/core/renderer.tsx) | Reuse renderer/camera/scene/raycaster/shadow/color/XR configuration. Replace Fiber containers and Provider ownership with `createUniversalRoot` and Octane context. |
| [`loop.ts`](https://github.com/pmndrs/react-three-fiber/blob/v9.6.1/packages/fiber/src/core/loop.ts) | Near-direct port after replacing the root registry and React ref-cell types. |
| [`events.ts`](https://github.com/pmndrs/react-three-fiber/blob/v9.6.1/packages/fiber/src/core/events.ts) | Reuse raycasting, hit ordering, 3D bubbling, hover, misses, capture, and propagation. Store universal listener IDs and deliver through `root.dispatchEvent`. |
| [`hooks.tsx`](https://github.com/pmndrs/react-three-fiber/blob/v9.6.1/packages/fiber/src/core/hooks.tsx) | Rewrite adapters with manually forwarded Octane hook slots. Replace `suspend-react` with a keyed cache plus Octane `use()`. |
| [`Canvas.tsx`](https://github.com/pmndrs/react-three-fiber/blob/v9.6.1/packages/fiber/src/web/Canvas.tsx) | Keep the DOM shell, sizing, event source, fallback, and configuration surface. Replace the second React root and bridge with the declared renderer region. |

Do not depend on React, ReactDOM, React Reconciler, `scheduler`, `its-fine`,
`react-use-measure`, `use-sync-external-store`, or `suspend-react`. Keep `three`
as a peer dependency. Start with a pinned Three 0.172.x oracle—the version used
by the v9.6.1 repository—and a current-version CI lane. Advertise R3F's broad
`three >=0.156` range only after a minimum-version lane passes.

Internally call the active rendering object `renderer`, retain `state.gl` for
v9 compatibility, and consider a `state.renderer` alias. This avoids baking a
WebGL-only assumption into the driver while leaving R3F 10/WebGPU work for a
later milestone.

## Phase 0: close the renderer ABI gates

These are foundation requirements, not Three-specific workarounds.

### Stable logical ID, replaceable public instance

Changing `args` or `<primitive object={...}>` reconstructs the Three object
while retaining the logical host and its children. The current universal root
emits `update` and only reattaches a ref when the ref prop changes. That would
leave a stable ref pointing at a destroyed object.

Add an optional, pure driver update classifier and a `recreate` host command.
`recreate` retains the core ID but explicitly changes its public instance, so
the core detaches and reattaches even an unchanged ref. The Three driver then
transfers children, attachments, listener registrations, hover/capture state,
and disposal ownership within one accepted host commit.

Observable exit tests:

- prop-only changes preserve the actual Three object;
- `args`/`primitive.object` changes produce a new object;
- stable callback and object refs detach from the old object and attach to the
  new one;
- children, attachments, and interaction state transfer without a synthetic
  pointer-out/enter cycle;
- a preflight-rejected replacement leaves the old scene, object, ref, and
  events intact; no committed object is disposed, while every owned object
  staged by the rejected preparation is disposed exactly once.

### Owner-routed host lifecycle

`onUpdate(self)` is a host lifecycle callback after fresh props, including the
initial mount. It cannot safely run re-entrantly inside host preparation, and
newly committed listener owners are not published until the host accepts the
batch.

Extend the renderer SDK with classified lifecycle listeners and a
post-host-accept, post-owner-publication, pre-ref/layout delivery phase.
Lifecycle errors route through the owning Octane component. The batch carries
serializable listener IDs, never function values, so the same lifecycle
vocabulary can cross a future native transport. String/deep/array attachment
remains ordinary driver work. The lifecycle classifier removes `onUpdate` from
the full prop snapshot before command serialization.

Function-form `attach` is a separate renderer-local host-callback extension
because it performs physical placement and returns its detach cleanup. A prop
classifier removes the function from the full host props and replaces it with
a local listener ID; function values never enter a serializable batch. The
local Three driver invokes it only after host acceptance, stores its cleanup
against the stable record, and drains the old cleanup/new attach on a move,
reconstruction, removal, or destroy before refs/layout effects. Errors are
accepted-then-routed commit faults and remaining cleanup still runs. A
transported renderer without a `local-host-callback` capability rejects this
form before preparation.

The accepted lifecycle order is part of the public renderer contract:

| Transition | Physical/lifecycle order | Ref behavior |
| --- | --- | --- |
| Create and place | Run function `attach`, then invoke `onUpdate(newObject)` exactly once after final placement, then attach the ref and run layout delivery. | Attach once to the accepted object. |
| Prop update | Apply final props, then invoke `onUpdate(object)` exactly once when host props changed. A changed function `attach` drains and replaces its cleanup first. | No churn unless the authored ref changes. |
| Recreate | Drain the old function-attach cleanup, replace/place and attach the new object, detach the old stable ref, invoke `onUpdate(newObject)` exactly once, attach the ref to the new object, then run layout delivery. | An unchanged ref still observes old `null`/detach followed by the new object. |
| Move | Perform final placement, rerun function attachment when its placement requires it, then invoke `onUpdate(object)` exactly once. | The stable public object keeps its ref. |
| Remove/destroy | Drain function-attach cleanup exactly once and do not invoke `onUpdate`; core performs ref detachment and layout cleanup in universal deletion order. | Detach from the removed public object. |

This exactly-once rule intentionally differs from R3F v9's internal
placement/invalidation path, which can call `onUpdate` more than once during an
initial placement. Octane exposes one lifecycle delivery for each accepted
create, host-prop update, recreate, or move. It is never delivered for a
rejected preparation.

### Event delivery scopes

One platform pointer event can deliver target, ancestor, hover-transition, and
missed-handler listener IDs. The current one-listener `dispatchEvent()` may
flush a discrete update between those calls and invalidate later listeners.
Add a nested renderer event scope that pins the accepted listener table,
dispatches listener IDs sequentially at one priority, and flushes scheduled
work once when the outer scope closes. Propagation decisions remain synchronous
inside the event manager. The API is host-neutral and also covers a native
event message that expands into several logical listeners.

### Retained/offscreen ownership and host visibility

Define renderer-neutral retained/offscreen ownership before fixing a command
spelling. Core owns fallback coexistence, logical identity, ref behavior,
effect disconnection/reconnection, renderer-hook subscription state, event
suppression, and resource retention. The host capability then receives
visibility operations; Three maps them to `object.visible` for `Object3D` and
detach/restore for attached geometry, material, and custom resources.

Cross-boundary suspension also needs a render-time owner bridge, not only host
commands. A suspended initial scene commits nothing; a suspended update retains
or hides its last accepted scene; fallback content can coexist; and a Three
child can activate the owning DOM pending boundary without exposing
partially-created GPU resources. `useFrame` subscriptions and hit testing stay
disconnected for offscreen owners and resume without losing component/Three
identity.

### Client-only server boundary

Do not serialize a live Three scene. Put `server: 'client-only'` on the renderer
registry descriptor, then let boundary metadata declare that the owning DOM
component renders its shell while omitting that child region. Server compilation
must produce export-preserving stubs for statically imported client-only scene
modules without evaluating their authored setup. A component export may flow
only into an omitted client region; any live server use of another export fails
with a source diagnostic. Side-effect-only imports are explicitly client-only
and become no-ops in the server graph.

The server renders the DOM `Canvas` shell/fallback and records enough boundary
identity for hydration to create one Three root on the client. The shared
resolver, compiler, and bundler adapters—not JavaScript tree shaking—own this
behavior, so Vite, Rspack, and Rsbuild make the same decision.

### Renderer-aware intrinsic tooling

Runtime/compiler selection exists, but language tooling does not yet associate
a renderer-selected file with that renderer's intrinsic catalogue. Extend the
normalized descriptor with a serializable type/capability module ID. Volar and
compile-time diagnostics resolve it using the same canonical filename rules as
Vite, Rspack, and Rsbuild. A Three scene then receives `ThreeElements` rather
than globally augmenting DOM intrinsics; a future Lynx renderer can supply its
own catalogue through the same seam.

### Host props and resource handles

Only the current universal command vocabulary and ownership rules are reusable
across a process boundary. Today's raw host-prop bags are a local-driver
contract: they can contain `primitive.object`, Three instances, resources, and
functions. Do not describe those bags as a serializable wire format.

Add a renderer prop classifier/codec whose result for every value is exactly
one of:

- a serializable value;
- a registered, root-scoped resource or portal-target handle;
- a local callback listener ID guarded by an advertised local-host-callback
  capability; or
- unsupported, producing a source diagnostic or preparation failure before
  public mutation.

Local Three can resolve handles to objects inside its root registry. A
transported driver must receive only encoded values and handles—never a shared
object or function—and must map remote validation/acknowledgement onto the
prepare/accept protocol. The proving transport is the gate for calling this a
wire contract.

### Same-renderer portals

`createPortal` is R3F core API and a prerequisite for substantial Drei
compatibility. Define a same-renderer portal that separates logical ownership
from physical target identity. Universal core owns logical ownership, target
lifetime, and renderer/root/container/transport-scope validation only. The
Three package adapts a local `Object3D` into a registered root-scoped target
handle and owns the R3F-style inherited/overridable store and event enclave.
Transported renderers require a serializable root-scoped handle or reject the
capability. A Three-specific proof may land first, but physical redirection
must not be modeled as a fake `Object3D` child.

### Host preparation and acceptance

Replace the single `driver.commit()` ambiguity with a renderer-neutral prepared
host transaction:

1. `prepareBatch` validates renderer identity, command topology, host types,
   props, attachment paths, target handles, and `before` references;
2. it stages constructors and fresh-object props while detached and returns an
   abortable token; preparation failure rejects with no public host mutation;
3. core marks the host transaction accepted, then calls the token's apply
   phase and publishes logical topology even if later commit work throws;
4. owner-routed host callbacks, refs, and layout effects drain in their defined
   order; disposal is scheduled only for accepted ownership changes.

This is intentionally not a promise to roll back arbitrary Three behavior.
Custom setters, `.set()` methods, Object3D add/remove event listeners, extended
classes, callback attachment, and disposal may have irreversible side effects.
Once accepted application begins, their errors are commit faults, not batch
rejections. An abandoned render, explicit abort, failed detached constructor,
or suspended attempt leaves the public scene and refs unchanged, but cleanup of
unpublished staged objects is allowed and observable to those objects. On an
abort or preflight failure, every successfully constructed, framework-owned
staged object is cleaned up exactly once; no previously committed object is
disposed. A global disposal log may therefore change only for unpublished
staged objects.

The same split gives a transported driver a place to serialize/validate before
send and to map remote acknowledgement to acceptance without pretending an
asynchronous host can be rolled back after acknowledgement.

## Three driver contract

The Three container owns a root store, the scene, a map from universal IDs to
instance records, universal listener IDs, and the disposal scheduler. The
publicly typed `Instance` escape hatch is a stable logical descriptor containing
the current Three object, host type, props, parent/children, and root ownership;
its `object` changes after reconstruction. `useInstanceHandle` returns that
descriptor and must remain current when the public object ref changes. A private
symbol may connect a Three object to the descriptor, but consumers must not
depend on the symbol or any fields outside the documented `Instance` shape.

Host behavior:

- `create`: resolve `primitive` or a constructor from the catalogue; validate
  array `args`; build a detached record.
- `update`: diff complete props; support `.set`, `.setScalar`, `.copy`, colors,
  layers, arrays, pierced properties, removed-prop defaults, stable shader
  uniforms, and texture color-space behavior.
- `recreate`: construct a new object under the same logical ID and transfer
  descendants, attachments, events, and interactivity. Universal core detects
  the changed public instance and performs the stable-ref detach/reattach.
- `insert`/`move`: use Three's Object3D order for scene objects; otherwise apply
  automatic geometry/material attachment or explicit string `attach`.
- `remove`: detach physically and remove interaction state while retaining the
  object until `destroy`.
- `destroy`: release framework metadata and schedule disposal. Never dispose a
  `primitive` object or `Scene`; inherit `dispose={null}` through a removed
  subtree.
- `event`: transactionally replace listener IDs. Only raycastable objects with
  active handlers enter the interaction set.

`extend({ Foo })` registers the `foo` intrinsic. `extend(FooClass)` registers a
stable private catalogue key and returns a renderer-branded universal component
token, not a React exotic component or untyped string. That token materializes
the registered host type with normal compiled children/props, so
`const Foo = extend(FooClass); <Foo />` remains a supported tree-shakeable form
and retains its identity across compatible HMR.

The public imperative `applyProps(object, props)` has deliberately narrower
ownership than a declarative host update. It applies ordinary, non-reserved
Three properties and invalidates an object that belongs to a managed root. It
leaves renderer-reserved event handlers, `onUpdate`, all attachment ownership
(including function-form `attach`), and disposal ownership unchanged; those
are registered only by declarative tree/root operations. Tests and docs must
not imply that imperative property application can install universal listeners
or lifecycle ownership.

Text inside a Three scene needs an explicit policy. Match R3F by silently
ignoring it through a typed renderer text policy: `reject | ignore | host`.
Three selects `ignore`; DOM/native text renderers can select `host`; absence
defaults to `reject`. Compiler and runtime consume the same policy and never
encode Three's negative behavior as a globally meaningful capability name. Any
future development warning is an intentional divergence and needs its own
decision and tests.

## Public compatibility target

### Required for the technical preview

- Complete installed Three catalogue, catalogue-form `extend({ Foo })`,
  component-form `const Foo = extend(FooClass)`, `primitive`, constructor
  `args`, `applyProps`, `dispose`, `getRootState`, and public Three-object refs.
- Object3D insertion/reordering, automatic and explicit attachment, prop
  updates, reconstruction, removal, and disposal.
- `Canvas`, `createRoot`, configuration/unmount, scene/camera/raycaster/
  renderer defaults, size, viewport, DPR, shadows, color management, and a
  renderer stub injection path. Preserve promise-returning `configure()` and
  both synchronous and asynchronous `gl` renderer factories.
- `useStore`, `useThree`, `useFrame`, `invalidate`, `advance`, global
  before/after/tail effects, and all three frameloop modes.
- Typed `ThreeElements`, math/color shorthand props, constructor inference,
  events on raycastable objects, and custom `extend` types.
- Vite and Rsbuild application builds, a raw Rspack compilation/HMR fixture,
  and one real-browser WebGL smoke. Pointer parity remains a later milestone.

### Required for stable R3F v9 web/core parity

- Complete ray/pointer event surface: hit ordering, 3D bubbling, occlusion,
  propagation, hover transitions, missed clicks, pointer capture, custom event
  managers, and event-source coordinates.
- `useLoader` cache, arrays, extensions, progress, `preload`, `clear`,
  `useGraph`, and asset-error routing.
- Retained Suspense fallback and Activity visibility semantics.
- Same-renderer Three portals with state/event overrides.
- Canvas DOM-shell SSR and hydration, HMR reconstruction, basic XR frame-loop
  integration, direct-root `OffscreenCanvas`, `unmountComponentAtNode`,
  `flushSync`/`act` mapped to Octane semantics, and testing utilities.
- An explicit map for every upstream public export and applicable test.

### Intentional exclusions or adaptations

- No React `reconciler` export or React-Reconciler build compatibility tests.
- `_roots` is private; expose supported root inspection only if an ecosystem
  use case requires it.
- Keep public `unmountComponentAtNode(canvas)` as a convenience over the private
  canvas-to-root registry, including `OffscreenCanvas` roots.
- Rename the `ReactThreeFiber` namespace to `OctaneThree`; a deprecated type
  alias is optional only if it materially helps source migration.
- Programmatic `render` accepts an Octane component plus props, not a React
  node. `act` and `flushSync` follow Octane scheduling.
- Imperative `applyProps` owns ordinary Three properties and invalidation only;
  declarative events, lifecycle, function attachment, and disposal remain
  root-owned as defined by the driver contract.
- Native Expo/React Native Canvas and polyfills are not the future Lynx API.
  A native/Lynx driver gets its own package after the transport ABI is proven.
- R3F 10 alpha's WebGPU/TSL hooks and new external scheduler are not in the v9
  parity claim.
- Drei, including public `Html`, controls, loaders/components, and helpers, is
  a follow-on port. A minimal reverse-DOM host can prove the boundary without
  being advertised as complete Drei `Html`.

## Delivery phases and exit gates

### Milestone 0 — scaffold and evidence harness (0.5–1 engineer-week)

Status: implemented. The package scaffold, compiler preset, renderer-local
intrinsics, workspace validation wiring, pinned R3F/Three provenance, complete
90-export/157-test crosswalk, and first same-source compiled scene oracle close
this milestone's exit gate.

- Create `packages/three`, renderer config fixtures, `status.json`, and package
  inventory/typecheck wiring.
- Pin R3F 9.6.1 and the exact Three oracle version.
- Check in an upstream export/test crosswalk with no unclassified cases.
- Build a canonical public scene serializer and the first matched
  Octane/R3F mesh fixture.

### Milestone 1 — renderer SDK extensions (3–5 engineer-weeks)

Status: implemented. The generic object-driver, mixed-intrinsic, and
Vite/Rspack/Rsbuild fixtures close this milestone's exit gate. Three-specific
host behavior begins in Milestone 2; cross-boundary pending/Activity projection
and HMR remain in their later milestones.

- Implement/test `recreate` and ref churn, prepared-host acceptance, lifecycle
  delivery, local host callbacks, event scopes, retained/offscreen semantics,
  typed text policy, prop codecs/resource handles, and renderer intrinsic
  metadata.
- Implement an executable generic client-only renderer proof across the shared
  resolver/compiler and the Vite, Rspack, and Rsbuild adapters. All three cover
  removed server imports, export-preserving stubs, live-use diagnostics, and
  client chunk references/manifest identity; Vite and Rsbuild additionally
  prove one-root hydration adoption. This cannot remain a specification-only
  gate.
- Add a Volar/compiler spike containing DOM and Three TSRX files in one project.
  Prove different intrinsic sets, conflicting names such as `line`, `path`,
  `audio`, and `source`, and custom `extend`/module augmentation without a
  global JSX intrinsic merge.
- Specify the same-renderer portal contract; the Three implementation lands in
  its own later milestone once the observable shape is fixed.

Exit: a proving driver replaces a public instance under a stable logical ID,
routes post-accept lifecycle errors, disconnects/reconnects retained hosts, and
rejects a failed preparation without public host mutation or committed-object
disposal. The generic client-only fixture avoids authored server execution and
emits the same graph split in raw Rspack; its Vite and Rsbuild variants hydrate
one client region with stable manifest identity. Mixed-renderer language
tooling selects the correct, non-global intrinsic catalogue.

### Milestone 2 — Three driver and catalogue (2–3 engineer-weeks)

Status: implemented. The catalogue, both `extend` forms, real Three host driver,
public host-behavior suite, prepared transition coverage, and exact same-source
R3F differential scene close this milestone's exit gate across mount, prop
update, keyed reorder, reconstruction, and unmount. Canvas, root store/config,
frame loop, and hooks remain Milestone 3; ray/pointer events remain Milestone 4.

- Catalogue/object and constructor-component `extend` overloads, `primitive`,
  `args`, prop diff/application, attachment, ordered insertion/moves,
  reconstruction, refs, and disposal.
- Real Three objects with an injected renderer stub; no WebGL required.

Exit: a compiled componentized scene is graph-equivalent to R3F across mount,
prop update, keyed reorder, reconstruct, and unmount, including identity and
disposal assertions.

### Milestone 3 — store, Canvas, loop, and hooks (2–3 engineer-weeks)

- Root store/configuration, scene/camera/raycaster/renderer, resize/DPR/
  viewport, color/shadows, Canvas boundary, cleanup, frame loop, global effects,
  `useStore`, `useThree`, `useFrame`, `useGraph`, and basic testing helper.
- Preserve promise-returning `configure()`, including synchronous and
  asynchronous `gl` factories, configuration deduplication, and teardown while
  configuration is pending.

Exit: the same scene builds as a Vite and Rsbuild application and through the
raw Rspack compilation/HMR fixture, and renders a non-blank equivalent frame in
Chromium. `frameloop="always"` owns one RAF loop, `"demand"` coalesces
invalidations, and `"never"` advances only under deterministic `advance()`.
Async renderer creation settles `configure()` before rendering. This is the
technical-preview cut if deferred features reject clearly.

### Milestone 4 — ray/pointer events (2–3 engineer-weeks)

- Universal event classification and priority, DOM event connection, pointer
  normalization, intersections, bubbling, hover, misses, propagation, capture,
  event-layer priorities, custom managers, and reconstruction-state transfer.

Exit: normalized R3F/Octane event logs match for target/eventObject, hit order,
points, propagation, hover transitions, capture, and resulting state. One
platform event uses one event scope and cannot flush away a later listener
mid-propagation. This gate covers non-portal roots; portal event integration is
closed by Milestone 6.

### Milestone 5 — assets, Suspense, Activity, and errors (2–3 engineer-weeks)

- Keyed loader cache and `useLoader` helpers, browser loader path, visibility,
  fallback/retained content, aborted resource safety, and Three-to-DOM error and
  pending projection.

Exit: initial suspension allocates no abandoned scene objects; update
suspension preserves identity and shows the correct fallback; reject/clear/
unmount release only owned resources.

### Milestone 6 — portals and portal events (2–3 engineer-weeks)

- Three portal target handles and state enclaves, inherited/overridden root
  state, logical context retention, event-manager integration, teardown, and
  invalid target/scope diagnostics.

Exit: portals preserve logical context while targeting an external `Object3D`;
state overrides are isolated; ray/pointer events cross the portal's physical
scene and logical ancestry correctly; teardown removes handlers and resources
without corrupting either root.

### Milestone 7 — client-only Canvas SSR and hydration (2–3 engineer-weeks)

- Implement the concrete Three `Canvas` server shell and omitted child region,
  client chunk linkage, hydration adoption, streaming fallback, error/pending
  projection, and teardown.
- Run production SSR/hydration through Vite and Rsbuild. Keep raw Rspack's gate
  to server/client graph classification and compilation because the low-level
  plugin does not own an application SSR lifecycle.

Exit: scene modules, constructors, and loaders do not execute on the server;
the DOM shell/fallback streams; production Vite and Rsbuild builds hydrate
exactly one Three root with stable boundary/manifest identity and no mismatch
or duplicate resource allocation; raw Rspack emits the same graph split.

### Milestone 8 — XR, HMR, and root lifecycle (2–3 engineer-weeks)

- Add compatible/incompatible HMR behavior, direct-root ergonomics,
  `OffscreenCanvas`, `unmountComponentAtNode`, context-loss recovery, basic XR
  integration, and the minimal reverse-DOM boundary proof needed to validate
  future Drei-style composition.

Exit: HMR retains or reconstructs precisely and leaves no stale refs, handlers,
or resources. A fake/controlled WebXR session start switches to the XR animation
loop, session end restores the configured frameloop, and root teardown
disconnects the loop without duplicate callbacks. Direct DOM and
`OffscreenCanvas` roots clean up deterministically.

### Milestone 9 — transported SDK proof (2–3 engineer-weeks)

- Add a minimal loopback/worker-style proving driver that serializes batches,
  encoded props, listener/lifecycle IDs, and root-scoped resource/portal
  handles without sharing objects or functions.
- Exercise acknowledgement, pre-ack rejection, post-ack commit faults,
  teardown, event scopes, stale message/version rejection, and the point at
  which refs/layout reads may become visible.

Exit: the new renderer SDK vocabulary works without shared objects or function
props. Until this gate passes, `octane/universal`, renderer config extensions,
and the Three renderer ABI remain explicitly experimental even if the local
Three package reaches web behavior parity.

### Milestone 10 — API and release hardening (1–2 engineer-weeks)

- Export/type matrix, current/minimum Three lanes, pack checks, docs, browser
  failures/context loss, performance baselines, status generation, and a patch
  changeset.

Exit: every applicable upstream case is classified and covered; there are no
`skip`, `todo`, or expected-failure tests; all remaining differences are the
explicit React/native/v10/Drei exclusions above.

## Validation plan

R3F v9.6.1 has 129 executable web/native/core tests; its separate test renderer
adds 28. Do not mechanically copy React internals. Maintain a crosswalk that
classifies each case as behavioral, differential, browser-only, type/package
evidence, or not applicable with a durable reason.

### Scene-graph tests — primary PR gate

Use Vitest, real Three objects, and an injected renderer stub. Assert public
objects: `instanceof`, actual parent/child order, ref identity, transforms,
attachments, disposal, root state, event results, and visible topology. Do not
assert universal command order, private record names, UUID snapshots, or exact
allocation counts. Dedicated lifecycle cases assert the transition matrix:
exactly-once `onUpdate`, function-attach cleanup, stable-ref churn only on
recreation, and staged-versus-committed disposal after rejected preparation.

### Differential oracle

Run matched `.tsrx` fixtures through:

- Octane plus `@octanejs/three`;
- `@tsrx/react` plus real `@react-three/fiber@9.6.1`.

Use the same Three version, injected renderer, and `frameloop="never"`. Compare
a canonical scene description after mount, update, reorder, reconstruction,
event, suspension, and unmount. Separately assert identity, ref/effect order,
disposal, visibility, and propagation—serialization cannot observe those.

### DOM, SSR, and bundler tests

Use realistic compiled `Canvas` fixtures for DOM ownership, forwarded props,
fallback, refs, ResizeObserver, context/error/pending bridging, event source,
and cleanup. Add a real `renderToString` -> hydrate round trip and production
SSR/hydration builds through Vite and Rsbuild. Raw Rspack fixtures assert the
same server/client graph split, chunk identity, compilation, and HMR transform
without claiming an app lifecycle its low-level plugin does not provide. Scene
constructors and loaders must not execute on the server.

### Real-browser WebGL

R3F's own test setup replaces `canvas.getContext` with a fake
WebGL2 context, so it is not enough as a release gate. Use Playwright Chromium
with a fixed-size, DPR-1, `frameloop="never"`, unlit scene. Verify a non-blank
manual frame, resize/DPR, pointer/raycast behavior, demand-loop invalidation,
shader/material compilation, asset loading, and absence of page/console errors.
Compare selected pixels or buffers, not cross-platform full-screen snapshots.

### Types, HMR, and packages

Compile-only fixtures cover catalogue inference, required constructor `args`,
vector/color shorthand, ref type, raycastable events, required
`primitive.object`, both `extend` forms, `Instance`/`useInstanceHandle`,
name-conflict aliases, and Canvas/root/hook types. Direct-root tests cover both
`HTMLCanvasElement` and `OffscreenCanvas` without pretending the DOM `Canvas`
component can run in a worker. A mixed-renderer language fixture verifies that
DOM and Three files resolve different intrinsic catalogues, including
conflicting tag names and custom catalogue augmentation.

HMR tests prove compatible edits retain state/object identity while `args`
edits reconstruct, refs churn, old resources dispose, and stale handlers cannot
dispatch. Run pack checks and the repository-wide typecheck/format gates.

### Benchmarks

Compare Octane, R3F 9.6.1, and plain Three for:

- mount/update/reorder/unmount of 1,000 simple meshes;
- constructor reconstruction and disposal;
- many `useFrame` subscribers;
- representative raycast/event delivery;
- minimal and full-catalogue bundle size.

Every benchmark carries a semantic checksum so a no-op cannot win. Record the
first baseline before choosing regression thresholds.

## Effort and critical path

- **Technical preview:** 8–12 engineer-weeks. It includes the reconstruction
  ABI, executable generic client-only/tooling proofs, real driver, Canvas/store/
  frame loop/hooks, all three bundler integrations at their owned layer, and
  browser smoke.
- **Stable R3F v9 web/core parity:** 18–28 engineer-weeks total for one senior
  engineer. The range includes events, assets, visibility, portals,
  SSR/hydration, types, browser evidence, and hardening—not just source
  translation.
- **Renderer SDK stabilization:** 20–31 engineer-weeks total including the
  transported proof. Full Lynx/native implementation is not part of this
  number.
- **Two experienced engineers:** approximately 12–18 calendar weeks after the
  Phase 0 contract is agreed, because driver/store and validation work can then
  overlap with events, web lifecycle, and the transport proof.
- **Not included:** the Drei ecosystem, a native/Lynx transport, or R3F 10
  WebGPU/TSL parity. A faithful public Drei `Html` alone is likely another 1–2
  engineer-weeks; broad Drei compatibility is a separate multi-month program.

These are confidence ranges rather than the arithmetic sum of every milestone
maximum. Milestone 10 is a final 1–2 week focus window for evidence and release
work that should run continuously from Milestone 2; if it is deferred until the
end, add that window to the totals.

The hard dependencies are:

```text
recreate/lifecycle ABI -> Three driver -> events and HMR correctness
visibility ABI         -> asset Suspense and Activity
portal contract        -> Three portals -> substantial Drei compatibility
client-only SSR policy -> Canvas SSR/hydration in Vite and Rsbuild
client-only graph rule -> equivalent raw Rspack server/client compilation
prepare/accept + codecs -> transported acknowledgement and native events
```

The first implementation worktree should therefore be the renderer-SDK slice,
not the full Three package. It gives the driver a sound contract and prevents
ref, lifecycle, suspension, and SSR compromises from becoming package-local
behavior.

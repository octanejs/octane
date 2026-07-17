# `@octanejs/three`

An experimental React Three Fiber 9-compatible web renderer for Octane. Octane
keeps ownership of component execution, hooks, context, Suspense, refs, and
effects; this package supplies the Three-specific host layer.

Milestones 0–10 are implemented across this package and Octane's renderer SDK
foundation. The current technical preview includes:

- the serializable compiler preset, renderer entry point, renderer-local Three
  intrinsic types, and pinned upstream export/test crosswalk;
- the Three constructor catalogue, object and constructor-component `extend`
  forms, `primitive`, and constructor `args`;
- real Three host objects with prop diff/application, automatic, string, and
  function attachments, ordered placement and moves, reconstruction, retained
  visibility, lifecycle/ref delivery, and ownership-aware disposal; and
- the DOM `Canvas` boundary, programmatic roots, promise-returning renderer
  configuration, the callable root store, camera/scene/raycaster setup,
  resize/DPR/viewport state, shadows and color configuration;
- one shared `always`/`demand`/`never` frame loop, global frame effects,
  `useStore`, `useThree`, `useFrame`, `useGraph`, managed-instance helpers, and
  the deterministic `@octanejs/three/testing` harness;
- R3F-compatible ray and pointer events, including 3D bubbling, hit ordering,
  propagation, hover transitions, missed clicks, pointer capture, custom event
  managers, external DOM sources, and coordinate prefixes;
- a Suspense-aware `useLoader` cache with constructor and instance loaders,
  scalar and array inputs, extensions, progress, GLTF graph augmentation,
  `preload`, `clear`, and cached error routing;
- retained Three Suspense and Activity visibility, ownership-safe teardown, and
  client-side Three-to-DOM pending/error projection;
- same-renderer `createPortal` placement into borrowed `Object3D` targets,
  R3F-shaped state/event enclaves, nested context retention, one shared frame
  loop, physical Three event bubbling, and root-scoped target teardown;
- client-only Canvas SSR that streams and hydrates the existing DOM shell and
  native canvas fallback without executing Three scene setup, constructors, or
  loaders on the server;
- direct `HTMLCanvasElement` and `OffscreenCanvas` roots, public Octane
  `act`/`flushSync` scheduling, callback-aware `unmountComponentAtNode`, and
  demand-loop invalidation after WebGL context restoration;
- controlled WebXR session-loop handoff and teardown, plus compatible HMR that
  retains live objects and incompatible `args` edits that reconstruct without
  stale refs, handlers, or resources;
- the low-level `DOMRegion` Three-to-DOM boundary with an explicit target and
  deterministic DOM ownership; and
- public behavior, prepared-driver, and same-source compiled scene evidence
  against R3F 9.6.1 with the exact Three r172 oracle;
- a real asynchronous `MessageChannel` renderer proof with structured-cloned
  batches and values, root-scoped resource/portal handles, listener IDs,
  acknowledgement-gated refs/layout, rejection/fault semantics, teardown, and
  native-event delivery; and
- a checked public export/subpath type matrix, Three r156/current compatibility
  lanes, a packed external consumer, real WebGL creation-failure and context-
  recovery coverage, and semantic-checksummed renderer and shipped-size
  benchmarks.

Three deliberate correctness fixes differ from R3F 9.6.1:

- removing a pierced prop such as `material-color` resets the nested material
  property, instead of writing the default to a same-named leaf on the root
  object; and
- reconstructing a captured or hovered object rewrites every stored
  intersection to the replacement, so subsequent captured events reach the
  live handler instead of retaining the retired object; and
- retained Activity subtrees are excluded from recursive raycasts while
  hidden, rather than allowing an interactive visible ancestor to pierce an
  invisible descendant.

## Compiler configuration

DOM remains the application renderer. Scene modules opt into Three through the
shared renderer preset and the `*.three.tsrx` convention:

```ts
import { defineConfig } from '@octanejs/vite-plugin';
import { threeRenderers } from '@octanejs/three/config';

export default defineConfig({
	compiler: {
		renderers: threeRenderers,
	},
});
```

The same serializable `threeRenderers` value can be supplied to the Rsbuild and
low-level Rspack integrations. Vite and Rsbuild own the production application
SSR/hydration lifecycle; the Rspack plugin owns the equivalent client/server
graph split, compilation, and HMR transforms rather than an application server.

The preset selects `@octanejs/three/renderer`, keeps Three scene modules
client-only on the server, ignores authored text inside scenes, exposes a
renderer-local intrinsic catalogue without merging Three tags into DOM JSX,
and declares both `Canvas.children` as the DOM-to-Three renderer boundary and
`DOMRegion.children` as the explicit Three-to-DOM boundary.

## Canvas and scene modules

The application remains a normal DOM Octane app. Only scene modules use the
`.three.tsrx` convention:

```tsx
// App.tsrx
import { Canvas } from '@octanejs/three';
import { Scene } from './Scene.three.tsrx';

export function App() @{
	<Canvas frameloop="demand">
		<Scene />
	</Canvas>
}
```

```tsx
// Scene.three.tsrx
import { useFrame } from '@octanejs/three';
import { useRef } from '@octanejs/three/renderer';

export function Scene() @{
	const mesh = useRef(null);
	useFrame((_state, delta) => (mesh.current.rotation.x += delta));
	<mesh ref={mesh}>
		<boxGeometry args={[1, 1, 1]} />
		<meshBasicMaterial color="hotpink" />
	</mesh>
}
```

The low-level API follows Octane's component-plus-props root convention and
accepts either an `HTMLCanvasElement` or an `OffscreenCanvas`. Both synchronous
and asynchronous renderer factories settle before the component can execute:

```ts
import { createRoot } from '@octanejs/three';

const root = createRoot(canvas);
await root.configure({ frameloop: 'never', dpr: 1 });
root.render(Scene, { color: 'hotpink' });
root.store.getState().advance(1 / 60);
```

Direct-root scheduling uses Octane's public `act` and `flushSync` semantics.
Call `root.unmount()` directly, or use
`unmountComponentAtNode(canvas, optionalCallback)` to remove the root registered
for either canvas kind. The optional callback runs synchronously only after
teardown completes successfully. Teardown disconnects events and XR, clears the
animation loop, releases scene resources, and disposes the renderer.

Tests can inject the WebGL-free deterministic harness from
`@octanejs/three/testing`; it drives the same root, host commits, hooks, and
public `advance()` loop as an application. Its awaitable `fireEvent()` helper
directly invokes the latest committed handler and settles scheduled work when
raycasting itself is not under test.

`Canvas` installs the default web event manager. Use `eventSource` to subscribe
through another element and `eventPrefix` (`offset`, `client`, `page`, `layer`,
or `screen`) to choose the coordinate pair. Programmatic roots can supply a
custom `events(store)` manager factory and update it through `state.setEvents()`.

`useStore()` returns the upstream-compatible callable store. Because a later
`store(selector)` call is a dynamic function call, the compiler cannot assign
that call its own lexical hook slot; keep that compatibility form unconditional
and in stable order. Prefer `useStore(selector, equality?)` or
`useThree(selector, equality?)` when using Octane's conditional-hook semantics.

## Root lifecycle, XR, and HMR

When the configured renderer exposes Three's XR event surface, the root listens
for `sessionstart` and `sessionend`. A presenting session uses
`renderer.xr.setAnimationLoop`; `frameloop="never"` remains manual, and ending
the session invalidates the configured non-XR loop. Unmount removes both
listeners, clears the XR callback, and makes any retained callback inert.

WebGL context loss is prevented while the root is live. Context restoration
invalidates the root so an `always` or `demand` root renders again; teardown
removes both context listeners before forcing renderer context loss.

Universal HMR preserves component state and Three object identity for compatible
edits. A constructor `args` change reconstructs the affected object, detaches
and reattaches stable refs, retires old handlers, and disposes the old owned
resource once. Vite and the Rspack/Rsbuild path emit the same universal HMR
wrapper behavior.

## DOM regions

`DOMRegion` is a low-level reverse-renderer boundary for mounting ordinary
Octane DOM content from a Three scene into an explicit DOM target:

```tsx
// Scene.three.tsrx
import { DOMRegion } from '@octanejs/three';

export function Scene(props) @{
	<DOMRegion target={props.overlayTarget}>
		<button onClick={props.onClick}>Inspect object</button>
	</DOMRegion>
}
```

Each region owns one child container and one DOM root. Updating or moving its
target preserves that container, DOM state, and node identity; deleting the
region removes its owned DOM deterministically. The target may be an
`HTMLElement` or an object ref whose `current` value is an `HTMLElement` or
`null`.

`DOMRegion` is not Drei `Html` and is not the WebXR DOM Overlay API. It provides
no positioning, occlusion, transforms, styling, or layout contract. Those
policies belong to future higher-level packages.

## Portals

`createPortal` keeps its children in the authored Octane owner/context tree but
places their Three hosts below a borrowed `Object3D`. The optional state layer
matches R3F's portal model: it has its own scene, raycaster, pointer, and event
priority while sharing the outer root's interaction registry and frame loop.

```tsx
import { createPortal, useThree } from '@octanejs/three';

function Overlay() @{
	const scene = useThree((state) => state.scene);
	<group name={scene.name + '-overlay'} />
}

export function Scene(props) @{
	<>
		{createPortal(<Overlay />, props.overlayTarget, {
			events: { priority: 2 },
		})}
	</>
}
```

Portal targets are borrowed and never disposed by Octane. A managed target must
belong to the same root; a local `Object3D` target also cannot cross a commit
transport. Pointer hits use the portal layer's camera/raycaster, then bubble
through physical `Object3D.parent` ancestry as they do in R3F. Component errors,
effects, context, and scheduling continue to follow logical Octane ownership.

## Assets, Suspense, and errors

`useLoader` follows the R3F v9 cache contract. A loader constructor is
instantiated once, while an existing loader instance is used directly. The
loader identity and normalized input form the cache key; extensions and
progress callbacks configure the first request for that key.

```tsx
import { useLoader } from '@octanejs/three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function Model() @{
	const gltf = useLoader(GLTFLoader, '/model.glb');
	<primitive object={gltf.scene} />
}

export function Scene() @{
	@try {
		<Model />
	} @pending {
		<group name="loading-model" />
	} @catch (error) {
		<group name={'model-error:' + error.message} />
	}
}

useLoader.preload(GLTFLoader, '/model.glb');
// Later, when the next read must issue a fresh request:
useLoader.clear(GLTFLoader, '/model.glb');
```

`clear` evicts the exact cache entry; it does not abort a request or dispose
the resolved asset. Declarative Three resources remain owned by their mounted
host tree, while objects passed through `primitive` remain caller-owned. A
root-level Three suspension or render error is projected through `Canvas` to
the nearest client DOM `@pending` or `@catch` arm. On the server, `Canvas`
streams its DOM shell and native `<canvas>` fallback without evaluating the
client-only scene. Hydration adopts that shell before measurement creates one
fresh Three root on the client.

## Compatibility target

The compatibility baseline is `@react-three/fiber@9.6.1` at commit
`2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7`, with `three@0.172.0` as the exact
behavioral and differential oracle. The published peer range is
`three >=0.156.0`, guarded by minimum-r156 and current-release CI lanes; the
r172 lane remains immutable so a moving current dependency cannot change the
parity oracle. TypeScript consumers must install `@types/three` from the same
Three release line explicitly; its patch revision may differ from the runtime.
It is an optional peer so a package manager cannot silently auto-install current
declarations beside an older supported runtime:

```bash
pnpm add three@0.156.0
pnpm add -D @types/three@0.156.0
```

React Native/Expo, R3F 10's WebGPU/TSL APIs, and Drei are separate follow-on
efforts.

See [`docs/three-port-plan.md`](../../docs/three-port-plan.md) for the delivery
phases and [`UPSTREAM.md`](./UPSTREAM.md) for source and license provenance.

# `@octanejs/three`

An experimental React Three Fiber 9-compatible web renderer for Octane. Octane
keeps ownership of component execution, hooks, context, Suspense, refs, and
effects; this package supplies the Three-specific host layer.

Milestones 0, 2, 3, 4, and 5 are implemented on top of Octane's renderer SDK
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
  client-side Three-to-DOM pending/error projection; and
- public behavior, prepared-driver, and same-source compiled scene evidence
  against R3F 9.6.1 with the exact Three r172 oracle.

Portals and portal event layers, full Canvas SSR/hydration adoption, XR,
OffscreenCanvas lifecycle, and live HMR behavior follow in later milestones.

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
low-level Rspack integrations. Vite and Rsbuild additionally own application
SSR and hydration; the Rspack plugin owns compilation and HMR only.

The preset selects `@octanejs/three/renderer`, keeps Three scene modules
client-only on the server, ignores authored text inside scenes, exposes a
renderer-local intrinsic catalogue without merging Three tags into DOM JSX,
and declares `Canvas.children` as the DOM-to-Three renderer boundary.

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

The low-level API follows Octane's component-plus-props root convention. Both
synchronous and asynchronous renderer factories settle before the component
can execute:

```ts
import { createRoot } from '@octanejs/three';

const root = createRoot(canvas);
await root.configure({ frameloop: 'never', dpr: 1 });
root.render(Scene, { color: 'hotpink' });
root.store.getState().advance(1 / 60);
```

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
the nearest client DOM `@pending` or `@catch` arm. Streaming server fallback
and Canvas hydration remain Milestone 7 work.

## Compatibility target

The compatibility baseline is `@react-three/fiber@9.6.1` at commit
`2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7`, with `three@0.172.0` as the exact
behavioral oracle. React Native/Expo, R3F 10's WebGPU/TSL APIs, and Drei are
separate follow-on efforts.

See [`docs/three-port-plan.md`](../../docs/three-port-plan.md) for the delivery
phases and [`UPSTREAM.md`](./UPSTREAM.md) for source and license provenance.

# `@octanejs/three`

An experimental React Three Fiber 9-compatible web renderer for Octane. Octane
keeps ownership of component execution, hooks, context, Suspense, refs, and
effects; this package supplies the Three-specific host layer.

Milestones 0, 2, and 3 are implemented on top of Octane's renderer SDK
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
  the deterministic `@octanejs/three/testing` harness; and
- public behavior, prepared-driver, and same-source compiled scene evidence
  against R3F 9.6.1 with the exact Three r172 oracle.

Ray and pointer events begin in Milestone 4. Asset loading, portals, full Canvas
SSR/hydration adoption, XR, OffscreenCanvas lifecycle, and live HMR behavior
follow in later milestones. Event configuration currently rejects with a clear
technical-preview diagnostic instead of silently accepting a non-functional
surface.

One deliberate correctness fix differs from R3F 9.6.1: removing a pierced prop
such as `material-color` resets the nested material property, instead of
writing the default to a same-named leaf on the root object.

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
public `advance()` loop as an application.

`useStore()` returns the upstream-compatible callable store. Because a later
`store(selector)` call is a dynamic function call, the compiler cannot assign
that call its own lexical hook slot; keep that compatibility form unconditional
and in stable order. Prefer `useStore(selector, equality?)` or
`useThree(selector, equality?)` when using Octane's conditional-hook semantics.

## Compatibility target

The compatibility baseline is `@react-three/fiber@9.6.1` at commit
`2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7`, with `three@0.172.0` as the exact
behavioral oracle. React Native/Expo, R3F 10's WebGPU/TSL APIs, and Drei are
separate follow-on efforts.

See [`docs/three-port-plan.md`](../../docs/three-port-plan.md) for the delivery
phases and [`UPSTREAM.md`](./UPSTREAM.md) for source and license provenance.

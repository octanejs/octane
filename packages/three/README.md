# `@octanejs/three`

An experimental React Three Fiber 9-compatible web renderer for Octane. Octane
keeps ownership of component execution, hooks, context, Suspense, refs, and
effects; this package supplies the Three-specific host layer.

Milestones 0 and 2 are implemented on top of Octane's renderer SDK foundation.
The current package includes:

- the serializable compiler preset, renderer entry point, renderer-local Three
  intrinsic types, and pinned upstream export/test crosswalk;
- the Three constructor catalogue, object and constructor-component `extend`
  forms, `primitive`, and constructor `args`;
- real Three host objects with prop diff/application, automatic, string, and
  function attachments, ordered placement and moves, reconstruction, retained
  visibility, lifecycle/ref delivery, and ownership-aware disposal; and
- public behavior, prepared-driver, and same-source compiled scene evidence
  against R3F 9.6.1 with the exact Three r172 oracle.

`Canvas`, `createRoot` and root configuration/store state, the frame loop and
hooks are not implemented yet; they are Milestone 3 work. Ray and pointer
events begin in Milestone 4, with assets, portals, browser rendering, and
Canvas SSR/hydration following in later milestones. Until the technical-preview
gate is reached, unsupported APIs should be treated as unavailable rather than
inferred from React Three Fiber.

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
client-only on the server, ignores authored text inside scenes, and exposes a
renderer-local intrinsic catalogue without merging Three tags into DOM JSX.
This is compiler/host wiring only in the current milestone; it does not yet
provide the DOM `Canvas` or programmatic root APIs.

## Compatibility target

The compatibility baseline is `@react-three/fiber@9.6.1` at commit
`2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7`, with `three@0.172.0` as the exact
behavioral oracle. React Native/Expo, R3F 10's WebGPU/TSL APIs, and Drei are
separate follow-on efforts.

See [`docs/three-port-plan.md`](../../docs/three-port-plan.md) for the delivery
phases and [`UPSTREAM.md`](./UPSTREAM.md) for source and license provenance.

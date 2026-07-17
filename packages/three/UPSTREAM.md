# Upstream React Three Fiber audit

This port targets the immutable React Three Fiber release `v9.6.1`:

- repository: `https://github.com/pmndrs/react-three-fiber`;
- tag commit: `2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7`;
- package: `@react-three/fiber@9.6.1`;
- exact Three behavior and type oracle: `three@0.172.0` and
  `@types/three@0.172.0`.

The port advertises the upstream `three >=0.156` range. Its immutable
differential oracle stays on r172, while separate CI jobs typecheck and run the
Octane-owned compatibility suite against the minimum r156 pair and the current
registry release. This prevents either a moving latest dependency or the pinned
oracle from standing in for the other compatibility claim. `@types/three` is an
optional peer that TypeScript consumers install from the same Three release line;
its patch revision may differ from the runtime. Making it optional prevents
package-manager peer auto-install from silently pairing current declarations with
an older supported runtime.

## Source boundary

The package adapts the R3F web/core behavior rather than its React renderer
shell:

- `packages/fiber/src/three-types.ts` informs renderer-local intrinsic and math
  shorthand types;
- `packages/fiber/src/core/reconciler.tsx` informs catalogue, reconstruction,
  ordering, attachment, disposal, and interaction-transfer behavior;
- `packages/fiber/src/core/utils.tsx` informs Three prop resolution and
  application;
- `packages/fiber/src/core/store.ts`, `renderer.tsx`, `loop.ts`, `events.ts`, and
  `hooks.tsx` inform their corresponding package-owned subsystems;
- `packages/fiber/src/web/Canvas.tsx` informs the DOM shell while Octane's
  declared renderer boundary replaces R3F's second React root and context
  bridge.

React Reconciler, ReactDOM, `scheduler`, `its-fine`, `react-use-measure`,
`use-sync-external-store`, and `suspend-react` are not runtime dependencies of
the port. React and R3F are development-only differential oracles.

The case-level export/test crosswalk must classify upstream behavior as
behavioral, differential, browser-only, type/package evidence, or not
applicable. It is release evidence, not permission to copy Fiber ownership
internals into Octane.

Milestone 5 follows the pinned `useLoader` observable contract: constructor
loaders are singleton instances, cache identity combines the loader and
normalized input, GLTF-shaped results receive the public graph map, and
`preload`/`clear` share that same key. Cache eviction does not imply asset
disposal; disposal follows Octane's declarative host ownership instead.

Milestone 6 follows the pinned `createPortal` contract: the supplied
`Object3D` is a borrowed physical target, the portal store has an immediate
`previousRoot` plus local scene/raycaster/pointer/event state, and pointer
events bubble through physical Three ancestry. Octane's universal portal range
retains logical context, error, effect, and scheduling ownership without
embedding React Reconciler or representing the target as a fake host child.

Milestone 7 follows the pinned web `Canvas` contract: the server emits the
ordinary DOM wrapper, canvas, and native fallback while omitting Three children.
Hydration adopts those DOM nodes, then positive client measurement creates one
fresh Three root. Scene setup, constructors, and loaders remain outside the
server execution path; client Three suspension and errors project through the
owning DOM boundary, and deleting the Canvas tears down the nested root.

Milestone 8 follows the pinned direct-root, HMR, and XR lifecycle contracts while
keeping scheduling under Octane. Direct roots accept `HTMLCanvasElement` and
`OffscreenCanvas`, expose Octane's `act` and `flushSync`, and support
callback-aware `unmountComponentAtNode`. Octane completes that teardown and
callback synchronously instead of retaining R3F's 500-millisecond delay.
Compatible universal HMR edits retain Three objects; constructor `args` edits
reconstruct them with ref, handler, and owned-resource cleanup. A controlled WebXR session hands rendering to
`setAnimationLoop`, respects manual `frameloop="never"`, restores the configured
loop on session end, and disconnects without leaving a live callback. WebGL
context restoration invalidates the live root before teardown removes its
listeners.

Milestone 9 validates the renderer vocabulary independently of an in-process
Three host. A real asynchronous `MessageChannel` carries structured-cloned host
batches to a separate object driver and returns versioned acknowledgement,
completion, rejection, fault, and event messages. Logical topology, lifecycle,
refs, layout effects, and teardown publish only after acknowledgement; pre-ack
rejection remains retryable, while post-ack faults retain the accepted commit.
The existing portal proof separately verifies that only a root-scoped portal
handle, never the raw target, enters a cloned batch.

Milestone 10 hardens the release claim with an existence-checked 90-export/
157-test crosswalk, public export and package-subpath type matrices, r156 and
current Three compatibility lanes, and an external packed consumer that builds
and executes the published package without React. Chromium coverage exercises
real WebGL construction failure and `WEBGL_lose_context` loss/restoration.
Renderer lifecycle/event benchmarks and minimal/full-catalogue shipped-size
benchmarks compare Octane Three, R3F 9.6.1, and direct Three behind semantic
checksums and committed ratio guards.

`DOMRegion` is an Octane-specific proof of the already-compiled Three-to-DOM
renderer boundary, so it is not part of the pinned R3F public-export inventory.
It mounts one DOM root under an explicit target and preserves that root while
the target moves. It is not Drei `Html`, is not the WebXR DOM Overlay API, and
defines no positioning, occlusion, styling, or layout behavior.

## License provenance

React Three Fiber is MIT-licensed, Copyright 2019–2025 Poimandres. Adapted
algorithms and types retain that notice in [`LICENSE`](./LICENSE). Three is a
peer dependency under its own MIT license; no Three source is vendored here.

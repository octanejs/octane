# @octanejs/three

## 0.1.3

### Patch Changes

- d426046: Mark package modules as side-effect-free so bundlers can remove unused
  public-root subsystems such as portals, DOM regions, and scheduling from
  Canvas-only applications.
- Updated dependencies [d426046]
- Updated dependencies [f511024]
  - octane@0.1.10

## 0.1.2

### Patch Changes

- Updated dependencies [c704664]
- Updated dependencies [5b7d9ed]
- Updated dependencies [5b7d9ed]
- Updated dependencies [91b5f45]
- Updated dependencies [c16778a]
- Updated dependencies [39f2c00]
- Updated dependencies [aabf79c]
- Updated dependencies [07511e4]
- Updated dependencies [5b7d9ed]
- Updated dependencies [0d2e265]
- Updated dependencies [3168360]
- Updated dependencies [81c8842]
  - octane@0.1.9

## 0.1.1

### Patch Changes

- 9e7a895: Apply updated Three portal state in the accepted render while keeping rejected portal renders isolated.
- a769631: Only invoke `unmountComponentAtNode` callbacks after root teardown completes successfully.
- 1114904: Add production-validated client-only Canvas SSR and hydration through Vite and Rsbuild, with the equivalent raw Rspack client/server graph split. Ensure Rsbuild browser environments replace Octane's `process.env.NODE_ENV` runtime guards during programmatic production builds.
- 6868005: Add a renderer-infrastructure synchronous drain for universal hook and HMR
  updates. Add direct `HTMLCanvasElement` and `OffscreenCanvas` lifecycle support,
  composed Octane `act` and `flushSync` exports, callback-aware root unmounting,
  WebGL context recovery, controlled WebXR animation-loop ownership, precise
  universal HMR reconstruction, and the explicit-target low-level `DOMRegion`
  boundary.
- 6ae2529: Add the initial R3F 9-compatible Three host renderer surface: compiler metadata
  and renderer-local intrinsics, the pinned upstream evidence crosswalk, catalogue
  and `extend` forms, real Three object construction, prop application,
  attachments, ordering, reconstruction, retained visibility, lifecycle/ref
  delivery, and ownership-aware disposal with same-source R3F differential
  coverage.
- 0de5c6d: Add the technical-preview Three root store, async renderer configuration, `Canvas` boundary,
  frame loop, compiler-visible selector hooks, and deterministic testing helper.
- 332bbc4: Add R3F-compatible ray and pointer events, DOM event sources, custom event managers, capture and hover semantics, and direct testing-event helpers.
- f07c628: Add the R3F-compatible `useLoader` cache, preload/clear helpers, retained Three
  Suspense and Activity behavior, real browser asset loading, and client
  pending/error projection through `Canvas`. Preserve universal host roots while
  their DOM owner is hidden and allow updated hidden Suspense content to retry
  without waiting for an obsolete promise.
- fac1c66: Add asynchronous acknowledgement semantics to the experimental universal
  renderer transport and complete the Three technical preview with verified
  package exports, supported Three-version lanes, real WebGL failure recovery,
  and renderer performance baselines. Compiler-proven keyed intrinsic leaf loops
  now use an opt-in compact universal transaction, while the Three driver stages
  and applies canonical retained mesh batches without cloning the full host tree.
  The production-browser 1,000-mesh stability run now measures mount at 0.98x and
  retained updates at 1.03x R3F, replacing the previous 3.66x and 15.55x gaps.
- 5287eac: Add transactional universal portal target handles and R3F-compatible Three portals with state enclaves, shared frame and event integration, physical Object3D bubbling, validation, and ownership-safe teardown.
- Updated dependencies [156f213]
- Updated dependencies [2a5f44f]
- Updated dependencies [f8e94f2]
- Updated dependencies [a12a3d9]
- Updated dependencies [1b21731]
- Updated dependencies [7a123d2]
- Updated dependencies [95b3081]
- Updated dependencies [38d95eb]
- Updated dependencies [ba36091]
- Updated dependencies [6ccdbce]
- Updated dependencies [d1bb5c3]
- Updated dependencies [9c21887]
- Updated dependencies [674f1a4]
- Updated dependencies [6ceab55]
- Updated dependencies [3445fa6]
- Updated dependencies [6cfb63d]
- Updated dependencies [c68562b]
- Updated dependencies [4de2b4f]
- Updated dependencies [6868005]
- Updated dependencies [1b21731]
- Updated dependencies [1b21731]
- Updated dependencies [1b21731]
- Updated dependencies [7efdbdd]
- Updated dependencies [314b38d]
- Updated dependencies [dcd2707]
- Updated dependencies [d63b0d0]
- Updated dependencies [39e779c]
- Updated dependencies [1b21731]
- Updated dependencies [f07c628]
- Updated dependencies [fac1c66]
- Updated dependencies [dbbcee1]
- Updated dependencies [5287eac]
  - octane@0.1.8

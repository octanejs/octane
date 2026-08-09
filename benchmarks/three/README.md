# Three renderer benchmark

This suite is the Milestone 10 performance and shipped-size evidence for
`@octanejs/three`. It compares the Octane renderer with
`@react-three/fiber@9.6.1` and direct Three on the same Three release.

## Runtime operations

`run.mjs` drives three production pages through one Playwright Chromium process.
The pages use real Three scenes and an injected no-WebGL renderer so the timings
isolate renderer/reconciler work from GPU and driver variance:

- mount, update, keyed reverse, and tree removal for 1,000 meshes;
- reconstruction of 1,000 constructor-backed intrinsic objects plus observed
  disposal, using the same catalogue-registration form in both bindings;
- the same reconstruction through each binding's component-form `extend`, so
  constructor-backed registration and owner-free compilation remain separately
  measurable;
- 1,000 frame subscribers, averaged across 20 manual frames that each update
  the same complete scene and camera matrices, including direct Three;
- 40 overlapping raycast targets, averaged across 20 native pointer events.

Plain Three is a practical lower bound, not an API-equivalent declarative
renderer. Each sample is rejected unless its public scene topology, object
identity, updated values, disposal count, frame callback and render counts, and
event checksum match the operation. Reconstruction timings stop when the scene
update commits; asynchronously scheduled disposal is then drained and verified
outside the timed section so event-loop wakeups are not attributed to
reconciliation. `unmount_tree_1k` measures clearing the rendered tree; it
intentionally excludes each framework's delayed root-registry cleanup.

Every runtime operation has a same-run ratio guard requiring Octane to be at
least as fast as React Three Fiber. Cross-origin-isolated production pages retain
high-resolution browser timers, and the normal and quick runners keep 20 and 10
measured samples respectively so sub-millisecond operations have more stable
comparison data.

## Bundle operations

`run-size.mjs` makes six isolated production library builds with the same Vite
target and esbuild minifier: minimal and full-catalogue entries for Octane Three,
R3F, and plain Three. It reports raw, gzip, and Brotli JavaScript bytes. Every
built entry is then loaded in Chromium and must produce one real named Three
`Mesh`; full-catalogue entries must additionally prove that the Three namespace
was retained.

Compiled Three scenes register only the built-in constructors their authored
intrinsics use, and constructor-form `extend` registers only its own class.
Direct roots therefore let unused Three exports and the DOM renderer tree-shake
from minimal applications. The full-catalogue entries explicitly retain the
complete Three namespace. Both Octane gzip results have same-run ratio guards
requiring them to be no larger than their React Three Fiber counterparts.

Run through the unified harness:

```bash
node benchmarks/bench.mjs --quick three-renderer three-bundle-size
node benchmarks/bench.mjs --record three-renderer three-bundle-size
node benchmarks/bench.mjs --ratios three-renderer three-bundle-size
```

The first two commands require the workspace dependencies to be installed and
the repository Playwright Chromium binary to be available.

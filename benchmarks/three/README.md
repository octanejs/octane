# Three renderer benchmark

This suite is the Milestone 10 performance and shipped-size evidence for
`@octanejs/three`. It compares the Octane renderer with
`@react-three/fiber@9.6.1` and direct Three on the same Three release.

## Runtime operations

`run.mjs` drives three production pages through one Playwright Chromium process.
The pages use real Three scenes and an injected no-WebGL renderer so the timings
isolate renderer/reconciler work from GPU and driver variance:

- mount, update, keyed reverse, and tree removal for 1,000 meshes;
- reconstruction of 1,000 constructor-backed objects plus observed disposal;
- 1,000 frame subscribers, averaged across 20 manual frames;
- 40 overlapping raycast targets, averaged across 20 native pointer events.

Plain Three is a practical lower bound, not an API-equivalent declarative
renderer. Each sample is rejected unless its public scene topology, object
identity, updated values, disposal count, frame callback checksum, and event
checksum match the operation. `unmount_tree_1k` measures clearing the rendered
tree; it intentionally excludes each framework's delayed root-registry cleanup.

## Bundle operations

`run-size.mjs` makes six isolated production library builds with the same Vite
target and esbuild minifier: minimal and full-catalogue entries for Octane Three,
R3F, and plain Three. It reports raw, gzip, and Brotli JavaScript bytes. Every
built entry is then loaded in Chromium and must produce one real named Three
`Mesh`; full-catalogue entries must additionally prove that the Three namespace
was retained.

Octane Three currently registers its built-in Three namespace when a root is
created, so its minimal result truthfully includes that implementation choice.
The paired full entry makes the cost visible instead of assuming catalogue
tree-shaking that the current runtime does not provide.

Run through the unified harness:

```bash
node benchmarks/bench.mjs --quick three-renderer three-bundle-size
node benchmarks/bench.mjs --record three-renderer three-bundle-size
node benchmarks/bench.mjs --ratios three-renderer three-bundle-size
```

The first two commands require the workspace dependencies to be installed and
the repository Playwright Chromium binary to be available.

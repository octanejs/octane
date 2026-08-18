# Drei upstream provenance

This port targets the immutable `@react-three/drei@10.7.7` release:

- repository: `https://github.com/pmndrs/drei`;
- tag: `v10.7.7`;
- tag commit: `b8b99fd4ca1dfb8d821335671320512daa6efea4`;
- package: `@react-three/drei@10.7.7`;
- React oracle: React 19 with `@react-three/fiber@9.6.1`;
- Three compatibility range: `three >=0.159`.

## Source and evidence boundary

`upstream/` is a byte-exact development-only snapshot of the release's `src/`,
`test/`, package manifest, TypeScript configuration, and MIT license. It is not
included in the published package. The registry artifact supplies the executable
React oracle and declaration surface; the tagged repository supplies authored
source, stories, test configuration, and the sole upstream end-to-end suite.

Drei has no focused unit-test corpus at this pin. Its observable component
contracts are primarily expressed through Storybook stories. Those artifacts are
therefore inventoried as upstream evidence, then exercised through paired React
and Octane characterization fixtures at the appropriate DOM, Three-scene, or
real-browser observation boundary.

The full tarball/Vite/Next workflow in `e2e.sh` remains out of scope. The
vendored `snapshot.test.ts` case now runs unchanged in Chromium through the
`playwright-full` lane, which creates the small Vite React app it expects from
the byte-exact vendored `App.tsx`. The separate `drei-adapted-browser` Vitest
project ports that scene to Octane and uses the same screenshot oracle; it is
adapted evidence, never a claim that the upstream test ran there. The upstream
runtime suite remains `insufficient`: its one case is genuine pristine evidence,
but an incomplete suite cannot replace the required upstream-suite lanes and
repo-authored differential evidence.

## Executable parity evidence

## Completeness contract

## Intentional renderer divergence

`View` supports Drei's inline Canvas form, including tracked rectangles, portal
scenes, scissor rendering, event computation, and render ordering. React Drei
also lets the same component render in a DOM root and transports its Three
children through `View.Port` using `tunnel-rat`. Octane components are
statically owned by one renderer, so a Three component cannot switch to the DOM
renderer or move authored children between independent DOM and Three roots.
Calling `View` from a DOM root therefore raises Octane's renderer-boundary
diagnostic, and `View.Port` remains a callable, type-compatible no-op.

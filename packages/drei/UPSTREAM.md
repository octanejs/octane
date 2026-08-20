# Upstream Drei audit

This port targets the immutable `@react-three/drei@10.7.7` release:

- repository: `https://github.com/pmndrs/drei`;
- tag: `v10.7.7`;
- tag commit: `b8b99fd4ca1dfb8d821335671320512daa6efea4`;
- package: `@react-three/drei@10.7.7`;
- React oracle: React 19 with `@react-three/fiber@9.6.1`;
- Three compatibility range: `three >=0.159`.

## Source and evidence boundary

`upstream/` is a byte-exact development-only snapshot of the release's `src/`,
`test/`, package manifest, TypeScript configuration, and MIT license; every file
verifies offline against the upstream git blob shas recorded in
`audit/upstream.lock.json`, and the pinned license is republished at the package
root as `LICENSE.upstream`. It is not included in the published package. The registry artifact supplies the executable
React oracle and declaration surface; the tagged repository supplies authored
source, stories, test configuration, and the sole upstream end-to-end suite.

Drei has no focused unit-test corpus at this pin. Its observable component
contracts are primarily expressed through Storybook stories. Those artifacts are
therefore inventoried as upstream evidence, then exercised through paired React
and Octane characterization fixtures at the appropriate DOM, Three-scene, or
real-browser observation boundary.

The complete tagged test tree contains exactly four artifacts, all under
`test/e2e/`: `App.tsx`, `e2e.sh`, `snapshot.test.ts`, and its Linux PNG snapshot.
They form one whole-gallery Playwright screenshot case. Their byte hashes and
dispositions are recorded in `audit/upstream-test-artifacts.json`.

The full tarball/Vite/Next workflow in `e2e.sh` remains out of scope. The
vendored `snapshot.test.ts` case now runs unchanged in Chromium through the
`playwright-full` lane, which creates the small Vite React app it expects from
the byte-exact vendored `App.tsx`. The separate `drei-adapted-browser` Vitest
project ports that scene to Octane and uses the same screenshot oracle; it is
adapted evidence, never a claim that the upstream test ran there. The upstream
runtime suite remains `insufficient`: its one case is genuine pristine evidence,
but an incomplete suite cannot replace the required upstream-suite lanes and
repo-authored differential evidence.

The tag contains no upstream type-test suite. The upstream `tsconfig.json`
compiles package source, while the `@ts-expect-error` comments in that source are
inventoried separately so removing one makes the audit fail. The port's
`typetests/` remain repository-authored API checks. Paired pristine/adapted
public-surface type lanes under `typetests/{pristine,adapted}/` run through
`react-parity:check`; the broader `typetests/*.test-d.ts` suite continues in
package typecheck.

## Executable parity evidence

`audit/react-parity.json` registers the pristine upstream Playwright lane, the
separate adapted upstream browser lane, the `drei-differential` Vitest project
(all paired React/Octane characterization files, including the View canary), and
repo-authored pristine/adapted type lanes with the global `react-parity:check`
harness. The View renderer-boundary divergence cites an ordinary
`ordinary:view-renderer-boundary` audit identity (not a React-parity lane) so
authentication stays in the ordinary `drei-guards` project.
`audit/test-classifications.json` gives every port-authored runtime and type
test file exactly one disposition. Paired files import the pinned React Drei
oracle in the test body; `config.test.ts`, `crosswalk-guard.test.ts`,
`react-parity-guard.test.ts`, and `view-renderer-boundary.test.ts` are
Octane-only and execute in the ordinary `drei-guards` project outside
`testExecution`. Ordinary `typetests/*.test-d.ts` files are classified
Octane-only and stay outside parity evidence; only the public-API pair under
`typetests/{pristine,adapted}/` is parity type evidence.

`audit/runtime-evidence.json` hashes every test file and every collected assertion
inventory. `audit/upstream-test-artifacts.json` records the executed screenshot
case and its supporting artifacts. `typetests/assertions.md` defines the
permitted import/comment transformations and shared assertion groups. The audit
guard includes negative controls for a dropped differential inventory file, deleted
assertion, removed upstream `@ts-expect-error` inventory entry, and fabricated
upstream type suite.

## Completeness contract

`audit/upstream-crosswalk.json` is generated from the pinned public runtime and
type surfaces. Every public web export must have an Octane implementation and
executable evidence before this package claims parity. Missing, placeholder, or
unclassified entries fail validation; intentional Octane differences require a
consumer-visible rationale and evidence from both implementations.

## Intentional renderer divergence

`View` supports Drei's inline Canvas form, including tracked rectangles, portal
scenes, scissor rendering, event computation, and render ordering. React Drei
also lets the same component render in a DOM root and transports its Three
children through `View.Port` using `tunnel-rat`. Octane components are
statically owned by one renderer, so a Three component cannot switch to the DOM
renderer or move authored children between independent DOM and Three roots.
Calling `View` from a DOM root therefore raises Octane's renderer-boundary
diagnostic, and `View.Port` remains a callable, type-compatible no-op.

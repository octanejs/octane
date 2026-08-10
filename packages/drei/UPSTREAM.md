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
`test/`, package manifest, TypeScript configuration, and MIT license. It is not
included in the published package. The registry artifact supplies the executable
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

That gallery runner is **out of scope** for the Vitest/Jest React-parity harness:
`e2e.sh` packs a release tarball and boots temporary Vite/Next apps before
Playwright compares a whole-canvas screenshot. Octane's parity execution kinds
are `vitest-full` and `jest-full`, so the pin treats the upstream runtime suite
as `absent` for harness purposes while still vendoring the four artifacts with
an explicit `out-of-scope` reason. Export-level behavior is covered by
repo-authored paired React/Octane Vitest tests instead.

The tag contains no upstream type-test suite. The upstream `tsconfig.json`
compiles package source, while the `@ts-expect-error` comments in that source are
inventoried separately so removing one makes the audit fail. The port's
`typetests/` remain repository-authored API checks. Paired pristine/adapted
public-surface type lanes under `typetests/{pristine,adapted}/` run through
`react-parity:check`; the broader `typetests/*.test-d.ts` suite continues in
package typecheck.

## Executable parity evidence

`audit/react-parity.json` registers the adapted `drei` Vitest project (paired
files only), an isolated `drei-differential` View canary, and repo-authored
pristine/adapted type lanes with the global `react-parity:check` harness.
`audit/test-classifications.json` gives every port-authored test file exactly
one disposition. Paired files import the pinned React Drei oracle in the test
body; `config.test.ts`, `crosswalk-guard.test.ts`, and `react-parity-guard.test.ts`
are Octane-only and execute in the ordinary `drei-guards` project outside
`testExecution`.

`audit/runtime-evidence.json` hashes every test file and every collected assertion
inventory. `audit/upstream-test-artifacts.json` records the out-of-scope Playwright
gallery and an empty transformation ledger. The package checker
(`scripts/check-react-parity.mjs`) is invoked from the generic
`scripts/react-parity/check.mjs` path via `drei-parity-lib.mjs`, so omitting that
wiring fails the shared audit. Type lanes are fail-closed: `drei-types-lib.mjs`
compares assertion-group inventories and an allowed import-root transformation
between the pristine and adapted public-api probes, with negative controls for a
deleted assertion or removed `@ts-expect-error`. The audit guard also covers a
skipped test file, removed upstream `@ts-expect-error` inventory entry, and
fabricated upstream type suite.

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

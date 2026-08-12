# Upstream provenance

This binding is pinned to [`react-transition-group` v4.4.5](https://github.com/reactjs/react-transition-group/tree/v4.4.5), commit `4cb51a9be0ebf508cb8f6506452097f7ebb874fe`. The pristine runtime oracle uses React 18.3.1 (upstream's supported peer range and the last React that still exposes `findDOMNode`); Octane package tests continue to use the workspace React 19 oracle.

The upstream project and this adapted package are licensed under BSD-3-Clause. The upstream notice is retained in `LICENSE` and `upstream/LICENSE`.

## Vendored evidence

`upstream/src` and `upstream/test` are byte-exact copies of the source and tests at the pinned tag. `audit/SHA256SUMS` records every retained artifact and `pnpm upstream:check` rejects drift. `pnpm upstream:verify` also checks `audit/upstream-test-dispositions.json`, `audit/case-crosswalk.json`, `audit/adapted-evidence.SHA256SUMS`, and `audit/adapted-case-contracts.json` so every upstream test artifact, case identity, adapted mapping, assertion body, and upstream probe fixture stays accounted for. File digests alone are not sufficient: the case-contract ledger pins per-case adapted/upstream assertion hashes and fixture exports against each cited upstream scenario, and negative controls refresh `adapted-evidence.SHA256SUMS` after mutation to prove the semantic contract—not a stale digest—rejects deleted assertions or weakened fixtures.

The vendored JavaScript is not published. The maintained implementation is under `src`. Adapted Octane tests are under `tests`. The strongest runtime oracle is the pristine Jest lane: `pnpm test:upstream` runs the pinned suite unchanged against React through the manifest `jest-full` executor and checks every identity against `audit/pristine-runtime.json`.

## DefinitelyTyped type-suite provenance

The React type oracle is [`@types/react-transition-group` 4.4.12](https://www.npmjs.com/package/@types/react-transition-group/v/4.4.12). Its canonical source is DefinitelyTyped repository path `types/react-transition-group`, pinned at commit `cccd2a9ffecb708ac0606faa7f81f0b7ec535bf9`; `typesPublisherContentHash` is `28d8cc9bfe6b15e0291a07b916505b49e5cf57cfd1f331db1d9ad49fd36bfd41`. The npm tarball omits its executable type test, so `upstream-types/react-transition-group-tests.tsx` and `upstream-types/tsconfig.definitelytyped.json` are byte-exact vendored copies from that commit. The pristine runner `upstream-types/tsconfig.json` retains DT's compiler options while resolving declarations from npm rather than vendored `.d.ts` files.

`pnpm test:type-parity` runs the pristine suite with `tsc`, then its one-for-one Octane adaptation in `typetests/react-transition-group-tests.tsx` with `tsrx-tsc`. `audit/type-parity.json` pins the permitted transformations and inventories both suites; its negative controls reject a skipped file, removed JSX assertion group, removed `@ts-expect-error`, or retargeted public import.

## Test-suite disposition

The pinned repository contains seven runtime suites plus four support files under `upstream/test`. Every artifact has a disposition in `audit/upstream-test-dispositions.json` (56 executable cases total). `audit/case-crosswalk.json` maps each upstream case to an adapted identity with a `// Per path:` citation, or records both findDOMNode cases as not-applicable. `audit/adapted-evidence.SHA256SUMS` pins adapted suite bodies and `tests/_fixtures/upstream-probes.tsrx`. `audit/adapted-case-contracts.json` records per-case assertion/fixture contracts for those mappings. Negative controls in `scripts/react-parity/react-transition-group-upstream-lib.test.mjs` reject a missing artifact disposition, a stale `caseCount`, a deleted suite, a removed case, adapted case drift, a missing citation, deleted assertions (after digest refresh), and fixture drift (after digest refresh). Adapted one-for-one coverage lives under `tests/upstream/` with `// Per path:` citations. Port-authored tests are classified in `audit/test-classifications.json`; type lanes follow the DefinitelyTyped suite under `audit/type-parity.json`.

| Upstream artifact | Disposition |
| --- | --- |
| `test/Transition-test.js` | Pristine oracle + adapted in `tests/upstream/Transition.test.ts` (both findDOMNode cases are not applicable) |
| `test/CSSTransition-test.js` | Pristine oracle + adapted in `tests/upstream/CSSTransition.test.ts` |
| `test/CSSTransitionGroup-test.js` | Pristine oracle + adapted in `tests/upstream/TransitionGroup.test.ts` |
| `test/TransitionGroup-test.js` | Pristine oracle + adapted in `tests/upstream/TransitionGroup.test.ts` (StrictMode double-appear is divergence `react-transition-group-no-strict-double-appear`) |
| `test/SwitchTransition-test.js` | Pristine oracle + adapted in `tests/upstream/SwitchTransition.test.ts` |
| `test/ChildMapping-test.js` | Pristine oracle + adapted in `tests/upstream/ChildMapping.test.ts` |
| `test/SSR-test.js` | Pristine oracle + adapted in `tests/ssr/upstream-import.test.ts` |
| `test/setup.js`, `setupAfterEnv.js`, `utils.js`, `.eslintrc.yml` | Support artifacts for the pristine Jest runner |

## Public surface

The published React package exposes six root modules and the Octane package preserves each mapping:

| React import | Octane import |
| --- | --- |
| `react-transition-group` | `@octanejs/transition-group` |
| `react-transition-group/Transition` | `@octanejs/transition-group/Transition` |
| `react-transition-group/CSSTransition` | `@octanejs/transition-group/CSSTransition` |
| `react-transition-group/TransitionGroup` | `@octanejs/transition-group/TransitionGroup` |
| `react-transition-group/SwitchTransition` | `@octanejs/transition-group/SwitchTransition` |
| `react-transition-group/ReplaceTransition` | `@octanejs/transition-group/ReplaceTransition` |
| `react-transition-group/config` | `@octanejs/transition-group/config` |

## Adaptation notes

Octane has no `ReactDOM.findDOMNode` equivalent. DOM-aware callbacks and `CSSTransition` therefore require `nodeRef`; callers that omit it still receive lifecycle timing and state transitions, but no inferred DOM node. This follows React Transition Group's recommended `nodeRef` path and avoids a legacy API that React Strict Mode deprecates.

Compiler-generated Octane children blocks are distinguished from genuine render props with `isChildrenBlock`. Introspective collection components should pass descriptor collections through the `children` prop (for example, `children={items.map(...)}`), so keys remain inspectable by `TransitionGroup`.

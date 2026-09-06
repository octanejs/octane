# Base UI utilities upstream ledger

`@octanejs/base-ui-utils` targets `@base-ui/utils@0.4.0`.

- Repository: https://github.com/mui/base-ui
- Immutable commit: `47b40521eab921c2756bf9bdb0b0f07fbfdb8c8c` (`v1.8.0`)
- Source directory: `packages/utils`
- npm integrity: `sha512-bO9fz25kKtPf+aZVyfQrC0PDmJdmVni31W2hCS5/Owb+inwdIL3XU26pCPRPlt4LSxZrBgLwubXQXQlKaFEZzw==`
- License: MIT; the exact upstream text is published as `LICENSE.upstream`.

The byte-exact source, tests, and package metadata live under `upstream/`.
`audit/upstream.lock.json` pins each file by its git blob and SHA-256 digest.
The npm provenance attestation was verified against the package integrity and
this source commit because the registry metadata omits `gitHead`.

## Source boundary

The immutable `packages/utils` source, tests and metadata are materialized under
`upstream/` from the pinned commit. Adapted native source is in `src/`, and the
retained adapted tests are in `tests/upstream/`. The published package contains
native source, documentation and both MIT notices.

The registration crosswalk accounts for all 235 immutable source registrations:
146 runtime registrations and 89 type assertions. Execution is verified separately.

## Verification

The source boundary contains 23 runtime test files and 6 type-test files.
Both runtime runners preserve upstream's one-retry CI policy and default to no
retries locally. The pinned configuration is retained in Base UI's
`audit/repository-fixtures/vitest.shared.mts`.

The pristine runtime uses React 19.2.8. The upstream `typescript` command resolves
TypeScript 7.0.2 through its `@typescript/native` alias; its separate TypeScript 6
package only provides `tsc6`. Pristine and adapted type suites use separate programs.

Native source and adapted type tests pass strict `tsrx-tsc` checks with declaration
checking enabled. The formal public type gate also passes. All 45 published utility entries and 85 entry/export pairs have consumer assertions.
The export map follows the npm package, so private store/platform files are not public subpaths.
The gate verifies the npm tarball integrity and installed declaration bytes before
using them as witnesses for intentional opaque types. New erasure in callbacks,
generic arguments, inherited properties, and refs is rejected. See
`tests/types/public.ts` and `tests/types/published-contract.ts`.

The full workspace pack check passes with the current public type and export-map
changes: 124 tarballs, 1,174 raw TSRX files, and 51 strict installed binding
consumers, each checked with and without Node ambient types.

The complete pristine and adapted runtime and type lanes pass, including all
146 runtime cases in each renderer. The complete registration crosswalk and
installed-package type checks pass. The utilities also run through Base UI's
complete native browser, SSR, hydration, and interaction suites.

## Native adaptations

- Host callbacks receive native DOM events; text edits use `onInput`.
- Refs are ordinary props, including callback cleanup and composed refs.
- Octane does not replay mount effects or render functions in Strict Mode.
- React Server Components and the private Flight format are unsupported.
- Object styles are preserved through Base UI composition; CSS text is rejected.
- The compiler assigns native hook slots to components and shared helpers.

Runtime comparisons for changed menu defaults, Strict Mode callback counts, and
abandoned derived state live in `packages/base-ui/tests/react-controls/`.

## Export surface

| Entry | Authored source |
| --- | --- |
| `./store` | `./src/store/index.ts` |
| `./platform` | `./src/platform/index.ts` |
| `./addEventListener` | `./src/addEventListener.ts` |
| `./areArraysEqual` | `./src/areArraysEqual.ts` |
| `./clamp` | `./src/clamp.ts` |
| `./createLogOnce` | `./src/createLogOnce.ts` |
| `./empty` | `./src/empty.ts` |
| `./error` | `./src/error.ts` |
| `./fastHooks` | `./src/fastHooks.ts` |
| `./fastObjectShallowCompare` | `./src/fastObjectShallowCompare.ts` |
| `./formatErrorMessage` | `./src/formatErrorMessage.ts` |
| `./formatNumber` | `./src/formatNumber.ts` |
| `./generateId` | `./src/generateId.ts` |
| `./getDefaultFormSubmitter` | `./src/getDefaultFormSubmitter.ts` |
| `./getReactElementRef` | `./src/getReactElementRef.ts` |
| `./inertValue` | `./src/inertValue.ts` |
| `./isElementDisabled` | `./src/isElementDisabled.ts` |
| `./isMouseWithinBounds` | `./src/isMouseWithinBounds.ts` |
| `./mergeCleanups` | `./src/mergeCleanups.ts` |
| `./mergeObjects` | `./src/mergeObjects.ts` |
| `./owner` | `./src/owner.ts` |
| `./reactVersion` | `./src/reactVersion.ts` |
| `./safeReact` | `./src/safeReact.ts` |
| `./shadowDom` | `./src/shadowDom.ts` |
| `./stringifyLocale` | `./src/stringifyLocale.ts` |
| `./testUtils` | `./src/testUtils.ts` |
| `./useAnimationFrame` | `./src/useAnimationFrame.ts` |
| `./useControlled` | `./src/useControlled.ts` |
| `./useEnhancedClickHandler` | `./src/useEnhancedClickHandler.ts` |
| `./useForcedRerendering` | `./src/useForcedRerendering.ts` |
| `./useId` | `./src/useId.ts` |
| `./useIdleCallback` | `./src/useIdleCallback.ts` |
| `./useInterval` | `./src/useInterval.ts` |
| `./useIsoLayoutEffect` | `./src/useIsoLayoutEffect.ts` |
| `./useMergedRefs` | `./src/useMergedRefs.ts` |
| `./useOnFirstRender` | `./src/useOnFirstRender.ts` |
| `./useOnMount` | `./src/useOnMount.ts` |
| `./usePreviousValue` | `./src/usePreviousValue.ts` |
| `./useRefWithInit` | `./src/useRefWithInit.ts` |
| `./useScrollLock` | `./src/useScrollLock.ts` |
| `./useStableCallback` | `./src/useStableCallback.ts` |
| `./useTimeout` | `./src/useTimeout.ts` |
| `./useValueAsRef` | `./src/useValueAsRef.ts` |
| `./visuallyHidden` | `./src/visuallyHidden.ts` |
| `./warn` | `./src/warn.ts` |

# Base UI upstream ledger

`@octanejs/base-ui` targets `@base-ui/react@1.8.0`.

- Repository: https://github.com/mui/base-ui
- Immutable commit: `47b40521eab921c2756bf9bdb0b0f07fbfdb8c8c` (`v1.8.0`)
- Source directory: `packages/react`
- npm integrity: `sha512-P0/1sxo6SBVZOklKMIedvTWqw2s2IQzi9x5bIVsXu980cuSOD4NeuRSs+/L7LZQfDkZP/uRZyGPyfFl/B1oH+Q==`
- License: MIT; the exact upstream text is published as `LICENSE.upstream`.

## Source boundary

The byte-exact source, tests, and package metadata live under `upstream/`.
`audit/upstream.lock.json` pins each file by its git blob and SHA-256 digest.
The npm provenance attestation was verified against the package integrity and
this source commit because the registry metadata omits `gitHead`.

## Verification

The source boundary contains 315 runtime test files and 41 type-test files.
The pristine runtime uses React 19.2.8. The upstream `typescript` command resolves
TypeScript 7.0.2 through its `@typescript/native` alias; its separate TypeScript 6
package only provides `tsc6`. Pristine and adapted type suites use separate programs.

Both runtime runners preserve the pinned `vitest.shared.mts` policy: one retry
in CI and none otherwise. The byte-exact configuration is retained under
`audit/repository-fixtures/`. Test identities, assertions, skips, and todos remain
subject to the same strict report validation after retries.

Native source and adapted type tests pass strict `tsrx-tsc` checks with declaration
checking enabled. The formal public type gate also passes. All 79 Base UI public entries and 2,042 entry/export pairs have consumer assertions.
The gate verifies the npm tarball integrity and installed declaration bytes before
using them as witnesses for intentional opaque types. New erasure in callbacks,
generic arguments, inherited properties, and refs is rejected. See
`tests/types/public.tsx` and `tests/types/published-contract.ts`.

The full workspace pack check passes with the current public type and export-map
changes: 124 tarballs, 1,174 raw TSRX files, and 51 strict installed binding
consumers, each checked with and without Node ambient types.

The registration crosswalk accounts for all 9,342 immutable source registrations:
9,326 retained conformance registrations and 16 explicit React-only exclusions.
These are source registrations, including type assertions and helper expansions;
they are distinct from executed test counts. Regenerate it with
`node packages/base-ui/scripts/build-registration-crosswalk.mjs --source-checkout <Base-UI-git-checkout>`.

The complete pristine and adapted runtime, Chromium, and type lanes pass.
Chromium executes 8,726 pristine and 8,709 native tests; unit execution passes
7,775 pristine and 7,758 native tests. All 98 same-fixture differential cases pass.
The reports account separately for every declared skip and todo. Native SSR,
hydration, focus, keyboard, portal, and identity regressions also pass.

## Native adaptations

- Host callbacks receive native DOM events; text edits use `onInput`.
- Refs are ordinary props, including callback cleanup and composed refs.
- Octane does not replay mount effects or render functions in Strict Mode.
- React Server Components and the private Flight format are unsupported.
- Object styles are preserved through Base UI composition; CSS text is rejected.
- The compiler assigns native hook slots to components and shared helpers.

The authored components use standard TypeScript/JSX syntax within `.tsrx` files.
Their formatter uses Prettier's TypeScript parser, which preserves generic call
signatures and mixed logical/nullish expressions. The TSRX formatter currently
loses required parentheses in these forms. This is a parser selection, and all
authored files remain subject to the repository format check.

Both runtime test lanes use upstream's exact jsdom 27.4.0. The shared environment
resolves Vitest from the binding so invoking tests from the repository root does
not silently substitute the root workspace's newer jsdom peer. The pristine test
helper also resolves the pinned user-event 14.6.3 instead of a newer transitive
version. The complete pristine run passes 7,775 Base UI and 146 utility tests;
upstream skip and todo registrations remain visible in its report.

The upstream Luxon source carries an existing `@ts-nocheck` directive. Its npm
declarations also have errors when compiled together with the Date-fns adapter
augmentation. The binding preserves this upstream limitation; generated consumer
contracts derive literal property and arity expectations from verified npm types
without importing conflicting upstream adapter programs into the native consumer.

Runtime comparisons for changed menu defaults, Strict Mode callback counts, and
abandoned derived state live in `packages/base-ui/tests/react-controls/`.

## Export surface

| Entry | Authored source |
| --- | --- |
| `.` | `./src/index.ts` |
| `./accordion` | `./src/accordion/index.ts` |
| `./alert-dialog` | `./src/alert-dialog/index.ts` |
| `./autocomplete` | `./src/autocomplete/index.ts` |
| `./avatar` | `./src/avatar/index.ts` |
| `./button` | `./src/button/index.ts` |
| `./checkbox` | `./src/checkbox/index.ts` |
| `./checkbox-group` | `./src/checkbox-group/index.ts` |
| `./collapsible` | `./src/collapsible/index.ts` |
| `./combobox` | `./src/combobox/index.ts` |
| `./csp-provider` | `./src/csp-provider/index.ts` |
| `./context-menu` | `./src/context-menu/index.ts` |
| `./dialog` | `./src/dialog/index.ts` |
| `./direction-provider` | `./src/direction-provider/index.ts` |
| `./drawer` | `./src/drawer/index.ts` |
| `./field` | `./src/field/index.ts` |
| `./fieldset` | `./src/fieldset/index.ts` |
| `./form` | `./src/form/index.ts` |
| `./input` | `./src/input/index.ts` |
| `./menu` | `./src/menu/index.ts` |
| `./menubar` | `./src/menubar/index.ts` |
| `./merge-props` | `./src/merge-props/index.ts` |
| `./meter` | `./src/meter/index.ts` |
| `./navigation-menu` | `./src/navigation-menu/index.ts` |
| `./number-field` | `./src/number-field/index.ts` |
| `./otp-field` | `./src/otp-field/index.ts` |
| `./popover` | `./src/popover/index.ts` |
| `./preview-card` | `./src/preview-card/index.ts` |
| `./progress` | `./src/progress/index.ts` |
| `./radio` | `./src/radio/index.ts` |
| `./radio-group` | `./src/radio-group/index.ts` |
| `./scroll-area` | `./src/scroll-area/index.ts` |
| `./select` | `./src/select/index.ts` |
| `./separator` | `./src/separator/index.ts` |
| `./slider` | `./src/slider/index.ts` |
| `./switch` | `./src/switch/index.ts` |
| `./tabs` | `./src/tabs/index.ts` |
| `./toast` | `./src/toast/index.ts` |
| `./toggle` | `./src/toggle/index.ts` |
| `./toggle-group` | `./src/toggle-group/index.ts` |
| `./toolbar` | `./src/toolbar/index.ts` |
| `./tooltip` | `./src/tooltip/index.ts` |
| `./types` | `./src/types/index.ts` |
| `./unstable-use-media-query` | `./src/unstable-use-media-query/index.ts` |
| `./use-render` | `./src/use-render/index.ts` |
| `./internals/composite` | `./src/internals/composite/index.ts` |
| `./internals/constants` | `./src/internals/constants.ts` |
| `./internals/createBaseUIEventDetails` | `./src/internals/createBaseUIEventDetails.ts` |
| `./internals/csp-context` | `./src/internals/csp-context/index.ts` |
| `./internals/direction-context` | `./src/internals/direction-context/index.ts` |
| `./internals/field-constants` | `./src/internals/field-constants/index.ts` |
| `./internals/field-register-control` | `./src/internals/field-register-control/index.ts` |
| `./internals/field-root-context` | `./src/internals/field-root-context/index.ts` |
| `./internals/filter` | `./src/internals/filter.ts` |
| `./internals/itemEquality` | `./src/internals/itemEquality.ts` |
| `./internals/form-context` | `./src/internals/form-context/index.ts` |
| `./internals/getDisabledMountTransitionStyles` | `./src/internals/getDisabledMountTransitionStyles.ts` |
| `./internals/getStateAttributesProps` | `./src/internals/getStateAttributesProps.ts` |
| `./internals/labelable-provider` | `./src/internals/labelable-provider/index.ts` |
| `./internals/noop` | `./src/internals/noop.ts` |
| `./internals/reasons` | `./src/internals/reasons.ts` |
| `./internals/resolveValueLabel` | `./src/internals/resolveValueLabel.tsrx` |
| `./internals/RequestQueue` | `./src/internals/RequestQueue.ts` |
| `./internals/serializeValue` | `./src/internals/serializeValue.ts` |
| `./internals/stateAttributesMapping` | `./src/internals/stateAttributesMapping.ts` |
| `./internals/temporal` | `./src/internals/temporal/index.ts` |
| `./internals/temporal-adapter-date-fns` | `./src/internals/temporal-adapter-date-fns/index.ts` |
| `./internals/temporal-adapter-luxon` | `./src/internals/temporal-adapter-luxon/index.ts` |
| `./internals/TimeoutManager` | `./src/internals/TimeoutManager.ts` |
| `./internals/types` | `./src/internals/types.ts` |
| `./internals/use-button` | `./src/internals/use-button/index.ts` |
| `./internals/useBaseUiId` | `./src/internals/useBaseUiId.ts` |
| `./internals/useAnchorPositioning` | `./src/internals/useAnchorPositioning.ts` |
| `./internals/useAnimationsFinished` | `./src/internals/useAnimationsFinished.ts` |
| `./internals/useOpenChangeComplete` | `./src/internals/useOpenChangeComplete.tsrx` |
| `./internals/usePressAndHold` | `./src/internals/usePressAndHold.ts` |
| `./internals/useRenderElement` | `./src/internals/useRenderElement.tsrx` |
| `./internals/useValueChanged` | `./src/internals/useValueChanged.ts` |
| `./internals/useTransitionStatus` | `./src/internals/useTransitionStatus.ts` |

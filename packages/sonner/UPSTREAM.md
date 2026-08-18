# Upstream provenance

This port targets the published `sonner@2.0.7` runtime and the matching
`v2.0.7` Git tag at commit `3ba7aa17ab7e8101b9cf4893936f873b0d4769b3`.

| Input | Location | Integrity |
| --- | --- | --- |
| npm tarball | `https://registry.npmjs.org/sonner/-/sonner-2.0.7.tgz` | SHA-256 `eb0f5dd35d890d38e8dcba1b242e9ac38cf45cc92c02aa914f144d98cfa7ce8f` |
| Git tag | `https://github.com/emilkowalski/sonner/tree/v2.0.7` | commit `3ba7aa17ab7e8101b9cf4893936f873b0d4769b3` |
| Vendored pin | `packages/sonner/upstream/` | same tag commit; source + Playwright suite |

The npm artifact contains the compiled runtime, declarations, styles, README,
package metadata, and MIT license. It does **not** contain the upstream test
suite. The Git tag does: `test/tests/basic.spec.ts` is an executable Playwright
suite backed by the Next.js app under `test/`. npm-tarball absence is therefore
not evidence that the repository has no tests; `upstreamSuites.runtime` is
`present`, and the suite is vendored at `packages/sonner/upstream/`.

- a pristine Playwright lane that runs the vendored suite unchanged against
  published `sonner@2.0.7` (chromium project) through the generic
  `playwright-full` harness runner;
- a same-fixture differential lane against published `sonner@2.0.7` on React.

Octane-only divergence authentication
(`tests/parity/divergence-contracts.test.ts`,
`tests/ssr/visibility-guard.test.ts`) stays in the ordinary Vitest shards and is
not counted as React-parity evidence.

Provenance stays `recorded-unverified` until every upstream identity has a
one-for-one adapted Octane counterpart (or an explicit residual gap) and the
full verified evidence set is complete.

When updating the pin, re-vendor `packages/sonner/upstream/` from the matching
Git tag, fetch and checksum the new npm artifact, refresh every manifest hash,
revisit each upstream-case disposition, and rerun every required behavioral and
type lane.

## Upstream runtime suite disposition

Source: `packages/sonner/upstream/test/tests/basic.spec.ts` (35 cases).

Each row is a one-for-one adaptation or explicit gap. Local Octane coverage is
cited when it exists; runner limits are not used as an exclusion reason.

| Upstream case | Disposition |
| --- | --- |
| toast is rendered and disappears after the default timeout | **Adapted (partial).** Same-fixture lifecycle oracle: `differential:sonner-toast-lifecycle`. Full timeout disappearance remains a pristine Playwright identity. |
| various toast types are rendered correctly | **Adapted (partial).** Toast-type rendering covered by ordinary `tests/toaster.test.ts`; pristine Playwright still owns the exact Next.js button matrix. |
| show correct toast content based on promise state | **Adapted (partial).** Ordinary `tests/toaster.test.ts` / `tests/state.test.ts` promise paths; pristine Playwright still owns the exact app fixture. |
| handle toast promise rejections | **Adapted (partial).** Ordinary state/promise suites; pristine Playwright still owns the exact rejection fixture. |
| promise toast with extended configuration | **Adapted (partial).** Ordinary toaster promise case; pristine Playwright still owns extended success description overrides. |
| promise toast with extended error configuration | **Adapted (partial).** Action `preventDefault` covered by ordinary `tests/parity/divergence-contracts.test.ts`; pristine Playwright still owns the extended error fixture. |
| promise toast with Error object rejection | **Adapted (partial).** Ordinary state/promise suites; pristine Playwright still owns the Error-object fixture. |
| render custom jsx in toast | **Adapted (partial).** Custom content path in ordinary divergence-contracts; pristine Playwright still owns the Next.js custom button fixture. |
| toast is removed after swiping down | **Adapted (partial).** Ordinary toaster swipe case; pristine Playwright still owns pointer geometry against the Next app. |
| dismissible toast is not removed when dragged | **Not yet adapted.** Non-dismissible drag retention needs a real-pointer Octane case or the pristine Playwright identity. |
| toast is removed after swiping up | **Adapted (partial).** Ordinary toaster swipe case; pristine Playwright still owns top-position geometry. |
| toast is not removed when hovered | **Not yet adapted.** Hover timer retention is browser-timing sensitive; track as a gap until pristine Playwright or a deterministic Octane timer case lands. |
| toast is not removed if duration is set to infinity | **Adapted (partial).** Ordinary toaster duration/infinity cases; pristine Playwright still owns the exact hover+wait fixture. |
| toast is not removed when event prevented in action | **Adapted.** Ordinary `tests/parity/divergence-contracts.test.ts` native action `preventDefault` path. |
| toast's auto close callback gets executed correctly | **Adapted (partial).** Ordinary toaster onAutoClose case; pristine Playwright still owns the exact callback element fixture. |
| toast's dismiss callback gets executed correctly | **Adapted (partial).** Ordinary toaster dismiss paths; pristine Playwright still owns the swipe-to-dismiss callback element. |
| toaster's theme should be light | **Adapted (partial).** Ordinary toaster theme/data-attribute contract; pristine Playwright still owns the Next query-param fixture. |
| toaster's theme should be dark | **Adapted (partial).** Ordinary toaster theme contract; pristine Playwright still owns `?theme=dark`. |
| toaster's theme should be changed | **Adapted (partial).** Ordinary toaster system-theme listener; pristine Playwright still owns the theme-button fixture. |
| return focus to the previous focused element | **Adapted (partial).** Ordinary toaster hotkey/focus case; pristine Playwright still owns the exact focus restore sequence. |
| toaster's dir prop is reflected correctly | **Not yet adapted.** Dedicated `dir` prop case not yet re-authored. |
| toaster respects the HTML's dir attribute | **Not yet adapted.** `dir` inheritance not yet re-authored. |
| toaster respects its own dir attribute over HTML's | **Not yet adapted.** `dir` precedence not yet re-authored. |
| show correct toast content when updating | **Adapted (partial).** Differential lifecycle + ordinary toaster update case. |
| should update toast content and duration after 3 seconds | **Not yet adapted.** Timed update path not yet re-authored. |
| cancel button is rendered with custom styles | **Adapted (partial).** Cancel control covered by ordinary divergence-contracts; CSS assertion remains pristine Playwright. |
| action button is rendered with custom styles | **Adapted (partial).** Action control covered by ordinary divergence-contracts; CSS assertion remains pristine Playwright. |
| string description is rendered | **Adapted (partial).** Ordinary toaster contract; pristine Playwright still owns the exact description button. |
| ReactNode description is rendered | **Adapted (partial).** Custom content path in ordinary divergence-contracts; pristine Playwright still owns the ReactNode description fixture. |
| aria labels are custom | **Adapted (partial).** Ordinary toaster accessibility contract; pristine Playwright still owns the custom ARIA labels button. |
| toast with toasterId only appears in the correct Toaster | **Adapted (partial).** Ordinary toaster routing case; pristine Playwright still owns dual-toaster page layout. |
| toast without toasterId only appears in the global Toaster | **Adapted (partial).** Ordinary toaster routing case; pristine Playwright still owns dual-toaster page layout. |
| toast with testId renders data-testid attribute correctly | **Adapted (partial).** Ordinary toaster contract; pristine Playwright still owns the testId button fixture. |
| toast without testId does not have data-testid attribute | **Not yet adapted.** Negative testId path not yet re-authored. |
| promise toast with testId maintains testId through state changes | **Adapted (partial).** Ordinary toaster promise + testId paths; pristine Playwright still owns the promise testId fixture. |

Support/config under `packages/sonner/upstream/test/` (Next app, Playwright
config, package metadata) is vendored as the suite harness, not as additional
case inventory. Upstream ships **no type tests** at this pin.

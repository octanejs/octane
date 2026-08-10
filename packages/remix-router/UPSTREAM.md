# React Router upstream

`@octanejs/remix-router` ports the supported runtime surface from
[`react-router@8.2.0`](https://github.com/remix-run/react-router/releases/tag/react-router%408.2.0).

## Immutable pin

- Package: `react-router@8.2.0`
- Tag and commit: `react-router@8.2.0` / `05180441b118d26da4df94bacc2211923d87e4c1`
- Repository: `https://github.com/remix-run/react-router.git`
- Source root: `packages/react-router/lib`
- Test root: `packages/react-router/__tests__`
- License: MIT
- npm archive SHA-256: `4ac4dc0f608dfaced2943da365c95634c9f5a550d33be6c10f1d13d70f59692b`
- Supported upstream range: exactly `8.2.0`
- React oracle: `react@19.2.7` and `react-dom@19.2.7`

The published package omits the repository test suite. The complete pinned
runtime suite has not been vendored and executed one-for-one, so the manifest
remains `recorded-unverified`. The repository has no separately executable
React Router type-test suite; its TypeScript configuration checks source and
runtime tests rather than a distinct type corpus.

## Public surface crosswalk

| Upstream entry point | Octane disposition | Evidence or gap |
| --- | --- | --- |
| Root `react-router` runtime namespace | Ported, with scope stubs | Exact root export test has no missing or extra names; framework-mode and RSC-only APIs throw documented scope errors. |
| `react-router/dom` | Ported | Exposes the Octane DOM RouterProvider variant; local DOM, SSR, and bounded differential coverage exists. |
| `react-server` root condition | No conditional build | Server-facing supported APIs are on the root/DOM Octane entries; RSC behavior is outside scope. |
| `react-router/internal` | Not exported | Upstream type-only internal subpath is not part of the supported Octane contract. |
| `react-router/internal/react-server-client` | Not exported | RSC client internals are outside scope. |
| `react-router/package.json` | Not exported | The Octane export map exposes root and `./dom` only. |
| Development, production, and module-sync conditions | No distinct Octane builds | Octane publishes source entry points; conditional-build parity is outside the bounded lane. |

## Upstream runtime-suite disposition

All executable artifacts below are present at the immutable pin. They are not
executed as a pristine full upstream suite. Selected router-core files were
adapted locally, but the local classification ledger does not count them as
full upstream parity evidence.

| Upstream area | Executable artifacts |
| --- | --- |
| `packages/react-router/__tests__` | `Route-test.tsx`, `Router-basename-test.tsx`, `Router-test.tsx`, `Routes-location-test.tsx`, `Routes-test.tsx`, `absolute-path-matching-test.tsx`, `createRoutesFromChildren-test.tsx`, `data-memory-router-test.tsx`, `data-router-no-dom-test.tsx`, `descendant-routes-params-test.tsx`, `descendant-routes-splat-matching-test.tsx`, `descendant-routes-warning-test.tsx`, `generatePath-test.tsx`, `gh-issue-8127-test.tsx`, `gh-issue-8165-test.tsx`, `greedy-matching-test.tsx`, `href-test.ts`, `index-routes-test.tsx`, `layout-routes-test.tsx`, `matchPath-test.tsx`, `matchRoutes-test.tsx`, `navigate-test.tsx`, `params-decode-test.tsx`, `path-matching-test.tsx`, `react-transitions-test.tsx`, `resolvePath-test.tsx`, `route-depth-order-matching-test.tsx`, `route-matching-test.tsx`, `same-component-lifecycle-test.tsx`, `unstable-useRouterState-test.tsx`, `use-revalidator-test.tsx`, `useHref-basename-test.tsx`, `useHref-test.tsx`, `useLocation-test.tsx`, `useMatch-test.tsx`, `useNavigate-test.tsx`, `useOutlet-test.tsx`, `useParams-test.tsx`, `useResolvedPath-test.tsx`, `useRoutes-test.tsx` |
| `packages/react-router/__tests__/dom` | `client-on-error-test.tsx`, `concurrent-mode-navigations-test.tsx`, `data-browser-router-legacy-formdata-test.tsx`, `data-browser-router-test.tsx`, `data-static-router-test.tsx`, `dom-export-test.tsx`, `fetcher-submit-tagname-test.tsx`, `flush-sync-navigations-test.tsx`, `link-click-test.tsx`, `link-href-test.tsx`, `link-push-test.tsx`, `nav-link-active-test.tsx`, `navigate-encode-params-test.tsx`, `partial-hydration-test.tsx`, `scroll-restoration-test.tsx`, `search-params-test.tsx`, `special-characters-test.tsx`, `static-link-test.tsx`, `static-location-test.tsx`, `static-navigate-test.tsx`, `stub-test.tsx`, `trailing-slashes-test.tsx`, `use-blocker-test.tsx`, `use-prompt-test.tsx`, `useLinkClickHandler-test.tsx` |
| `packages/react-router/__tests__/dom/ssr` | `components-test.tsx`, `fog-of-war-test.ts`, `links-test.tsx`, `meta-test.tsx` |
| `packages/react-router/__tests__/router` | `browser-test.ts`, `context-middleware-test.tsx`, `create-path-test.ts`, `data-strategy-test.ts`, `fetchers-test.ts`, `flush-sync-test.ts`, `hash-base-test.ts`, `hash-test.ts`, `instrumentation-test.ts`, `interruptions-test.ts`, `lazy-discovery-test.ts`, `lazy-test.ts`, `mask-test.ts`, `memory-test.ts`, `navigation-blocking-test.ts`, `navigation-test.ts`, `path-resolution-test.ts`, `redirects-test.ts`, `resolveTo-test.tsx`, `revalidate-test.ts`, `route-fallback-test.ts`, `router-memory-test.ts`, `router-test.ts`, `scroll-restoration-test.ts`, `should-revalidate-test.ts`, `ssr-test.ts`, `submission-test.ts`, `view-transition-test.ts` |
| `packages/react-router/__tests__/server-runtime` | `actions-test.ts`, `cookies-test.ts`, `data-test.ts`, `handle-error-test.ts`, `handler-test.ts`, `markup-test.ts`, `responses-test.ts`, `server-test.ts`, `sessions-test.ts` |
| `packages/react-router/__tests__/rsc` and `vendor` | `rsc/server-test.ts`, `vendor/turbo-stream-test.ts` |
| `packages/react-router-node/__tests__` | `sessions-test.ts`, `stream-test.ts` |

## Upstream support-artifact disposition

| Pinned support area | Artifacts |
| --- | --- |
| Root runner support | `packages/react-router/__tests__/setup.ts`, `packages/react-router/__tests__/tsconfig.json`, `packages/react-router-node/__tests__/tsconfig.json`, `packages/react-router/__tests__/__snapshots__/route-matching-test.tsx.snap` |
| DOM support | `dom/components/LazyComponent.tsx`, `dom/polyfills/drop-FormData-submitter.ts` |
| Router sequences | `EncodedReservedCharacters.ts`, `GoBack.ts`, `GoForward.ts`, `InitialLocationDefaultKey.ts`, `InitialLocationHasKey.ts`, `Listen.ts`, `ListenPopOnly.ts`, `PushMissingPathname.ts`, `PushNewLocation.ts`, `PushRelativePathname.ts`, `PushRelativePathnameWarning.ts`, `PushSamePath.ts`, `PushState.ts`, `PushStateInvalid.ts`, `ReplaceNewLocation.ts`, `ReplaceSamePath.ts`, `ReplaceState.ts` under `router/TestSequences` |
| Router helpers | `router/utils/custom-matchers.ts`, `router/utils/data-router-setup.ts`, `router/utils/urlDataStrategy.ts`, `router/utils/utils.ts` |
| Shared helpers | `server-runtime/utils.ts`, `utils/MemoryNavigate.tsx`, `utils/framework.ts`, `utils/getHtml.ts`, `utils/getWindow.ts`, `utils/renderStrict.tsx`, `utils/tick.ts`, `utils/waitForRedirect.tsx` |

## Bounded evidence

The client `remix-router-runtime-differential` lane compiles eight shared fixtures for
React and Octane and selects nine exact test identities. It covers nested and
declarative navigation, loader data/redirect/error reset, Await fallback and
resolution, Navigate redirects, NavLink/search params, form/fetcher outcomes,
blocker state, and an explicitly gated pending navigation. Every asynchronous
step waits for a named semantic state on both runtimes before byte comparison.
The required `remix-router-ssr-differential` lane adds five exact static-render
and hydration-payload comparisons from a ninth shared fixture. These bounded
lanes do not establish exhaustive parity for the full upstream
suite, internal/RSC subpaths, conditional builds, or every supported API.

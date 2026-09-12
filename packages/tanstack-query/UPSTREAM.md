# Upstream

- Package: `@tanstack/react-query@5.102.8`
- Repository: https://github.com/TanStack/query
- Commit: `2969edf32f7e0c48e2a108d84712d6e01edfde21`
- Source and tests: `packages/react-query/src`, including `src/__tests__`
- License: MIT; exact upstream text ships as `LICENSE.upstream`.

## Source boundary

`audit/upstream.lock.json` pins every regular file in the package, the complete
source/test subtree, and root license. The two monorepo configuration symlinks
are excluded; neither contains adapter implementation or test registrations.
`upstream/` is byte-exact, unpublished evidence. `tests/upstream/` is regenerated
from the lock's import/type rewrites and committed divergence patches.

The release's npm declarations are retained in an integrity-verified tarball
under `upstream-artifact/`. The shared provenance verifier checks that artifact,
the attribution file, and the four immutable monorepo test utilities plus their
package manifest. Those utilities come from the same commit under
`packages/query-test-utils`; they are test-only. Published framework-neutral
`@tanstack/query-core@5.102.8` supplies caches, observers and all core re-exports.
React, its testing utilities and the persistence test oracle are dev dependencies.

## Supported surface

The root entry preserves every published adapter export and re-exports the neutral
core. `audit/upstream-crosswalk.json` lists all 213 upstream value and type exports
with public contract evidence. The existing `QueryErrorResetBoundaryValue` type
remains available for compatibility. The package does not copy the neutral core
or add convenience subpaths; upstream's `package.json` export describes its own
package metadata.

Query 5.102 removes `experimental_prefetchInRender`, its observer `promise` field,
and private before/after-query callbacks. Prefetch hooks use the new core query
execution APIs; their public options reject `skipToken`. Options carry the updated
query-key data tags, infinite-query defaults and mutation-state inference. Passive
`useQueries` does not report an optimistic fetch. Suspense infinite queries exclude
placeholder data, and falsey errors still reach opted-in boundaries. The mixed
query tuple overloads and component prop declarations match the published API.

## Executable evidence

The required pristine lane runs all 404 runtime registrations unchanged against
React. Adapted client and server lanes run the same 404 cases with no omissions.
Separate strict TypeScript programs cover all 167 pinned type registrations;
authored source and published imports receive independent strict checks. Public
probes check all 213 exports, concrete inferred results and invalid inputs. The
required differential lane compares cached queries, asynchronous queries and
mutations against the exact React release. Octane conformance covers subscriptions,
cache identity, error resets, transitions, cleanup and server snapshots.

The nine upstream SSR cases compile against Octane's server runtime and inspect
`RenderResult.html`. All three upstream hydration cases render a real Vite server
fixture, hydrate its separately compiled client twin, preserve the original text
node and retain their fetch/error/DOM assertions. Renderer markers are excluded
from visible-text assertions.

Committed patches explain intentional renderer differences: native StrictMode
behavior, a direct observation queue in place of React's render-stream harness,
error-boundary callbacks in place of React console argument formatting, visible
states in place of React replay counts, and query-owned timers in place of global
scheduler timing. Five type-suite checks of unused component declarations become
invalid-query negative controls because the authored-source program does not use
upstream's `noUnusedLocals` lint setting. Public type assertions remain strict.

Hook implementations retain compiler-assigned slots and Octane's stable Suspense
promise replay handling. They do not import React. Hydration uses the native
provider/component ownership model; the adapter publishes no separate streaming
server entrypoint.

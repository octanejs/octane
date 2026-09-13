# TanStack Router SSR Query upstream ledger

`@octanejs/tanstack-router-ssr-query` targets
`@tanstack/react-router-ssr-query@1.167.2` from https://github.com/TanStack/router.

- Commit: `0dbb77f7260b4919786c2c3d594b8c262de43a9e`
- npm archive SHA-256: `1301a0f79fab7aca720fc2289cf6c9e6157e2e76d4442241fd6a9420f646a7c5`
- npm integrity: `sha512-yRvy0VJ00R8huPuquk+qyYQGMpYRc/G33mc6/yZ4f7LaBZz9h/VbACjmLzhm/+6u5WSmUt6ouJJZnI1/5Npfag==`
- License: MIT, retained verbatim in `LICENSE.upstream`
- Framework-neutral dependency: `@tanstack/router-ssr-query-core@1.169.2`, as published by the adapter

## Source boundary

The complete eight-file upstream package is retained byte-exact in `upstream/`.
`audit/upstream.lock.json` authenticates each Git blob offline, and
`audit/provenance.json` authenticates the npm archive and license. The published
package includes only authored source and documentation, not the snapshots.

The owned implementation is the 29-line React wrapper adapted to Octane's
Fragment and QueryClientProvider. Router dehydration, streaming, redirects, and
cache hydration are imported from the neutral core. The adapter preserves an
existing router wrapper inside the query provider and honors
`wrapQueryClient: false`. The crosswalk accounts for both public exports,
`Options` and `setupRouterSsrQueryIntegration`. The metadata-only upstream
`./package.json` subpath is intentionally omitted, as recorded in `status.json`.

Upstream has no runtime or dedicated type-test registrations. Its source compile
matrix is retained across TypeScript 5.6, 5.7, 5.8, 5.9, 6.0, and 7.0. Native source
is checked with `tsrx-tsc`; the other compilers do not accept `.tsrx`. Separate
strict pristine, adapted, authored-source, and public-entry programs exercise both
exports and reject invalid options without `skipLibCheck`.

Two React/Octane differential cases compare provider-backed server output,
preservation of an existing wrapper, and disabled query wrapping. Native SSR
checks additionally exercise real router dehydration, cached queries, the query
stream, and preservation of the original dehydration callback. A production
Chromium test hydrates the provider, retains server DOM and pre-hydration input
edits/focus, updates page and portal consumers, isolates sibling query clients,
and verifies observer cleanup on unmount. This browser test covers the owned
provider lifecycle, not end-to-end transport of the neutral core's stream.

Regenerate the required lanes and source closure with
`node packages/tanstack-router-ssr-query/scripts/generate-parity.mjs`.
The machine evidence gate records final verification separately from this
description of the executable coverage.

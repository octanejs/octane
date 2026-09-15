# Upstream

- Repository: https://github.com/TanStack/router
- Package/release: `@tanstack/react-router@1.170.35`
- Commit: `6494e75362ff7ca4988ef41046498dea10cbc462`
- Source root: `packages/react-router/src`
- Test root: `packages/react-router/tests`
- License: MIT, packaged verbatim in `LICENSE.upstream`
- npm integrity: `sha512-MiqKL692aSOFsbtEts5eFjfCixxrej+ko+gA2Y85gmWdxolgtfcBPOdJ6tMSi/zFePqwwPLo+CVSUWu/qXu8LQ==`

## Source boundary

The byte-exact source and tests live in `upstream/`, authenticated by
`audit/upstream.lock.json`. The shared materializer regenerates `tests/upstream/`
using the lock's import rewrites and committed patches. Source snapshots and test
artifacts are excluded from the published package.

All 987 upstream runtime registrations are retained: 986 execute successfully in
each renderer and the same upstream-skipped route-context case stays skipped.
The pristine wrapper asserts the complete set of passed and skipped identities.
All 167 type registrations across 19 upstream files are checked separately using
React's declarations and Octane's authored source.

The binding imports `@tanstack/router-core@1.171.29`,
`@tanstack/history@1.162.3`, `@tanstack/store@0.11.1`, and `isbot@5.2.1` directly.
Only the renderer integration is adapted. Native store snapshots, refs, delegated
events, Suspense, and error boundaries replace their React counterparts.

Adapted test patches preserve scenarios and assertions while replacing React
class/forwardRef constructs with native components and ref props. SSR tests run
the same route factories in separate client and server compiler graphs. Native
readable streams replace React pipeable streams; managed script ownership and
retained script text nodes follow Octane's document contracts. Native `act()`
settles boundary resets before retaining a queried fallback node.

Runtime lanes are registered in the root Vitest configuration. Repository-authored
navigation, SSR/hydration, and differential suites remain additional integration
evidence and are not counted as upstream registrations.

Public declaration checks cover 629 export contracts across the main, history,
SSR client, SSR server, and generator entrypoints. They use the published release
as the primary witness. The unpublished `upstream-artifact/previous-binding/`
snapshot preserves existing Octane contracts that React does not publish:
`audit/compatibility-baseline.json` authenticates every original package/source
file against the campaign's preflight baseline at
`9f211380cf6e71ac5b081481301d69d65d2b60bc`. It includes the original Octane license.
The checker rejects incomplete inventories, changed bytes, and escaping paths.

Native component bodies receive compiler scope arguments, refs are ordinary
props, and SSR render helpers accept an application component. Existing history,
route-generator, route-context, and native component exports remain supported.
The native `createRoute` signature preserves its correctly positioned SSR type
parameter; the pinned React declaration places that argument in the file-route
metadata position. Focused compile assertions retain SSR and route-param
inference, typed hook results with compiler slots, Await payloads, and scroll
restoration results. Native anchor attributes are compared separately from route
options; the original 167 type cases and recursive opacity checks retain the
precise route and callback contracts.

Regenerate the declaration projections with
`node packages/tanstack-router/scripts/generate-public-contracts.mjs --manifest <campaign-manifest>`
which formats the generated files. Regenerate the matrix and source closure with
`node packages/tanstack-router/scripts/generate-parity.mjs`.
The package test command runs native behavior, SSR, browser, differential, and the
pristine wrapper. The required parity matrix runs the complete adapted suite,
including its authenticated upstream skip; the root Vitest run also includes it.

The client SSR runtime is forwarded unchanged through `src/ssr/core-client.js`.
Its adjacent declarations isolate the neutral core's `node:http2` header import
from browser consumers. Serialized-router types are derived from the core's
existing Window contract. Header fields retain the exact structural shape from
MIT `@types/node@24.13.3`; its attribution is shipped in `LICENSE.node-types`.
Node public-contract checks compare these declarations against the upstream
exports, and packed browser checks compile the actual RouterClient source.

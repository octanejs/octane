# TanStack React Router SSR Query upstream ledger

`@octanejs/tanstack-router-ssr-query` targets
`@tanstack/react-router-ssr-query@1.167.1` from `https://github.com/TanStack/router.git`.

## Immutable pin

- Tag: `@tanstack/react-router-ssr-query@1.167.1`
- Resolved commit: `8b3659143f634542c455a9d7915a8c7e8fabb65d`
- npm archive SHA-256: `14b0cc524faad53c9e0d68fb2277bdd66147f0589048762fde82dda6aa7fa743`
- npm lock integrity: `sha512-W9j5JPnBikyafvuUfykFfHIWod58OAbAAa5leNkXBcoDoocghMmu6w9uZOmUZvAWT7CSvgj5tBUtF7CM2OoHXQ==`
- Supported range: exactly `1.167.1`
- License: MIT
- React oracle: workspace-pinned React and React DOM
- Framework-neutral core: `@tanstack/router-ssr-query-core@1.169.1`, the version published by the pinned adapter

## Source, exports, and suites

The byte-exact tagged adapter directory is vendored under `upstream/` and pinned by
`audit/upstream.lock.json`: each committed file verifies offline against its upstream git blob
sha at the pinned commit (`pnpm react-port:materialize run --check --package-dir
packages/tanstack-router-ssr-query`). The upstream MIT license is retained byte-exact as
`LICENSE.upstream`, hash-matched to the lock. The tagged
package contains no runtime test, fixture, or snapshot artifacts. Its `test:types` scripts compile
package source across TypeScript 5.5–6.0 (accept/reject compile results, no dedicated `expectType`
artifacts). The pristine type lane invokes the vendored `upstream/package/tsconfig.build.json`
under `typescript55`–`typescript60` (matching upstream's matrix) and inventories each compiler
result. The adapted lane mirrors that compile once with `tsrx-tsc` (TypeScript 5.9-equivalent);
TypeScript 5.5, 5.6, 5.7, 5.8, and 6.0 are recorded as adapted-lane incompatibilities because
Octane's typecheck toolchain is a single `tsrx-tsc` version.

The package publishes one runtime entrypoint plus a metadata-only `./package.json` entrypoint. The
export crosswalk maps `Options` and `setupRouterSsrQueryIntegration` individually. The Octane
package deliberately omits the metadata subpath; that gap, its consumer impact, and agreement with
`status.json` are recorded in `audit/upstream-crosswalk.json`. The published `1.167.1` adapter
depends on core `1.169.1`; the Octane dependency is therefore faithful rather than a version drift.

## Executable evidence

A repo-authored server differential executes equivalent setup calls against the Octane and pinned
React adapters. It compares provider-backed SSR output, preservation of an existing wrapper, core
dehydrate/lifecycle mutations, and the `wrapQueryClient: false` control. Existing local tests remain
Octane framework contracts and are not counted as React parity.

Because upstream supplies no adapter runtime suite and the differential is representative rather
than exhaustive over core streaming, redirects, and hydration, the binding remains
`recorded-unverified`.

# Upstream

- Repository: https://github.com/TanStack/router
- Release tag: `@tanstack/react-router@1.170.18`
- Commit: `58c005fcb1a0618ec8c5b96b2b5fe3ccab5736c5`
- Package: `@tanstack/react-router@1.170.18`
- Source root: `packages/react-router/src`
- Test root: `packages/react-router/tests`
- License: MIT
- npm tarball SHA-256: `921d54033a68692c3528658b6300573743e6a09bb3c316e14cdc513b6bee6c31`

The tagged repository contains runtime and compile-time suites. The published npm
artifact omits those tests; that does not waive fetching the canonical tag for
parity provenance. Until pristine-upstream and one-for-one adapted suite lanes
are fetched from that tag and registered, `provenance.verification` stays
`recorded-unverified` and the generic React parity job only validates this
manifest.

Current executable evidence on this branch is the repo-authored differential
lane (`tanstack-router-differential`) plus the repository-authored adapted type
suite. Octane-only divergence and SSR framework-contract tests remain in the
ordinary shards and are not counted as adapted React-parity evidence.

# SWR upstream contract

## Pin and source boundary

| Field | Value |
| --- | --- |
| Package | `swr` |
| Version | `2.4.2` |
| Canonical tag | `v2.4.2` |
| Canonical commit | `f1c1fd855f1e9e7c85755e4232ea4b03c7f81910` |
| Supported range | exactly `2.4.2` |
| License | MIT, © 2023 Vercel, Inc. |
| npm tarball SHA-256 | `948ad899c51e73ca9555e8182946978f367410406fe6c2acb4d1012c509c9982` |

The canonical `src/`, `test/`, package metadata, Jest configurations, root
TypeScript configuration, and license are vendored byte-exact under `upstream/`.
`upstream/SHA256SUMS` locks all 100 vendored evidence files, including the npm
tarball at `upstream/npm/swr-2.4.2.tgz`. The tarball is retained because it
contains compiled condition branches and declarations rather than the canonical
source and tests.

The pristine Jest config maps `@testing-library/react` through a narrow harness
for the `useSWR` remote-mutation race case. Upstream starts a 10 ms request and
assumes the mutation click wins that wall-clock race. The harness holds only that
request completion until the click has started the mutation, then releases it so
the unchanged assertion deterministically exercises the intended overlap.

## Provenance status

`packages/swr/audit/react-parity.json` is `recorded-unverified`. Required lanes
still execute through the generic harness, but the adapted runtime inventory is a
selected cited subset (not a one-for-one map of the pristine identities), and the
adapted type projects are repo-authored export/call probes rather than structural
ports of the upstream type assertion suite.

Every authored runtime and type evidence file is classified exactly once in
`packages/swr/audit/test-classifications.json`, including adapted suites under
`tests/upstream/` and compiler-executed programs under `typetests/`.
`react-parity:check` discovers those paths and fails closed on any unclassified
file. Promoting provenance to `verified` still requires the exhaustive two-way
runtime/type crosswalk with assertion/fixture preservation controls and
per-upstream dispositions for every applicable pristine identity.

## U1 gate

U1 is not a partial implementation. Authored source modules currently expose
sentinels solely to prove that the repository can pack and resolve the exact
root/subpath/condition graph. U2 may begin only after:

1. the vendored hashes and complete public API oracle pass;
2. the unchanged pinned Jest runtime suite and all three unchanged TypeScript
   projects execute;
3. packed ESM, CommonJS, `react-server`, NodeNext, Bundler, and package metadata
   probes pass, including omitted server-export negatives; and
4. the external-store, Suspense, mutation, streaming, hydration, and devtools
   architecture probes pass.

No U1 sentinel is parity evidence.

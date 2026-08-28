# TanStack React Devtools upstream ledger

`@octanejs/tanstack-devtools` targets `@tanstack/react-devtools@0.10.7` from
`https://github.com/TanStack/devtools.git`.

## Immutable pin

- Tag: `@tanstack/react-devtools@0.10.7`
- Resolved commit: `c6374669b8f56d7e64542b5d385af9be606e5aa7`
- npm archive SHA-256: `79faf09d544b1558c0ed01c3b6784b4b0d4e84485a6beb3195ce13dcdbf1e94b`
- npm lock integrity: `sha512-AYHQH06uuK07Asqq8eASgJjpILlaFBpjnTesxx1JVHGoBl4ijwbyIlKnj3Z8+M8sEOPn5mvtV5o6mielPXKHWg==`
- License: MIT
- React oracle catalog: `tanstack-devtools-react-oracle`
- React oracle: `react@19.2.7` / `react-dom@19.2.7` with `@types/react@19.2.17` / `@types/react-dom@19.2.3`

The byte-exact tagged adapter directory is vendored under `upstream/` and pinned by
`audit/upstream.lock.json`: each committed file verifies offline against its upstream git blob
sha at the pinned commit (`pnpm react-port:materialize run --check --package-dir
packages/tanstack-devtools`). The upstream MIT license is retained byte-exact as
`LICENSE.upstream`, hash-matched to the lock.
The lock authenticates all nine adapter files, including both source files. The tagged package contains
no runtime tests, fixtures, or snapshots; its `test:lib` command explicitly allows no tests.

Upstream `test:types` runs `tsc` over the complete React adapter source with the package config.
There are no dedicated `expectType` fixtures, so type-suite strength is the source compile itself.
This binding records `upstreamSuites.types` as present and runs that pristine `tsc` compile plus an
adapted `tsrx-tsc` compile of the Octane adapter source. `audit/type-parity.json` pairs the two
compiler programs with a `fileMap` (`index.ts`↔`index.ts`, `devtools.tsx`↔`devtools.tsrx`),
export-surface and structural comparison under permitted transforms, TypeScript
config/program membership negative controls (exclude via tsconfig `files`, not
directory deletion), and inventories. Repo-authored public-API probes remain
supplementary controls beside that source map.

The package publishes one runtime entrypoint and a metadata-only package entrypoint. The published
adapter resolves `@tanstack/devtools@0.12.4`; the current Octane catalog resolves `0.12.5`. That
dependency drift and the Octane-specific type names/core re-exports are recorded as divergences
and authenticated by ordinary `conformance:` audit cases outside parity ownership.

A repo-authored same-fixture differential compares mount, config synchronization, plugin/title/
trigger portals, and teardown against the pinned React public entrypoint (`src/index.ts`). The
export crosswalk lists each public upstream export with an Octane mapping or explicit divergence.
With required differential and type lanes executing in the dedicated parity job, verification is
`verified`; remaining gaps stay as explicit divergences rather than silent omissions.

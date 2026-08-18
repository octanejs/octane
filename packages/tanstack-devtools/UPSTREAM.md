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

The byte-exact tagged adapter directory and root license are vendored under `upstream/`.
`SHA256SUMS` authenticates all ten files, including both source files. The tagged package contains
no runtime tests, fixtures, or snapshots; its `test:lib` command explicitly allows no tests.

The package publishes one runtime entrypoint and a metadata-only package entrypoint. The published
adapter resolves `@tanstack/devtools@0.12.4`; the current Octane catalog resolves `0.12.5`. That
dependency drift and the Octane-specific type names/core re-exports are recorded as divergences
and covered by ordinary `conformance:` cases.

A repo-authored same-fixture differential compares mount, config synchronization, plugin/title/
trigger portals, and teardown against the pinned React public entrypoint (`src/index.ts`). The
export crosswalk lists each public upstream export with an Octane mapping or explicit divergence.
With required differential and type lanes executing in the dedicated parity job, verification is
`verified`; remaining gaps stay as explicit divergences rather than silent omissions.

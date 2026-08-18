# TanStack React Pacer upstream ledger

`@octanejs/tanstack-pacer` targets `@tanstack/react-pacer@0.22.1` from
`https://github.com/TanStack/pacer.git`.

## Immutable pin

- Tag: `@tanstack/react-pacer@0.22.1`
- Resolved commit: `a894009100aeb373965d4121eb92a1af634af012`
- npm archive SHA-256: `d4055dcec785b5eac078a2c2acde90b80e84e70c0262a174a5065ed92a9be2f0`
- npm lock integrity: `sha512-CenQqK0GluSPIrnsG1yuD7w5uMSQ/4lI9AcGEFxBrRd66r260boWcYRIsS5+eHtXb238FoZYhKmJPGlhRzmHRw==`
- Supported range: exactly `0.22.1`
- License: MIT
- React oracle: exact `react@19.2.7`, `react-dom@19.2.7`, `@types/react@19.2.17`, and `@types/react-dom@19.2.3` via the `tanstack-pacer-react-oracle` catalog
- Framework-neutral core: exact `@tanstack/pacer@0.21.1`, reused by both adapters

## Source, exports, and suites

The byte-exact tagged adapter directory and root license are vendored under `upstream/`.
`SHA256SUMS` authenticates all 52 files, including 43 source files. The tagged package contains no
runtime test, fixture, or snapshot artifacts. Upstream's `test:types` script compiles package source
with `tsc` and has no dedicated type-assertion files, so suite presence is `insufficient` while
compile lanes still run.

## Type lanes

## Executable evidence

A repo-authored adapted-octane Vitest suite covers the Octane scheduler lifecycle (debounce,
throttle, batching, and teardown cancellation). A paired differential runs the same compiled
fixture against the Octane and React adapters under Vitest fake timers, advancing the exact waits
and asserting intermediate observable DOM. `tests/pacer.test.ts` and
`tests/parity/contracts.test.ts` remain Octane-only contracts and are not counted as React parity.

This representative scheduler lifecycle does not exhaustively prove every sync/async hook family,
provider, render-prop subscription, state/value helper, or option combination; those remain
surface-present via the crosswalk without additional runtime cases.

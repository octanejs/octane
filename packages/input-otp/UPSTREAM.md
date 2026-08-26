# input-otp upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `input-otp` |
| Version | `1.5.0` |
| Canonical repository | `https://github.com/guilhermerodz/input-otp.git` |
| Canonical tag | `v1.5.0` |
| Canonical commit | `3daad8fc88c9a041dbce98e97185efd65b3d87de` |
| Supported upstream range | exactly `1.5.0` |
| npm integrity | `sha512-3AcfdW1sNG0FmSA5hHMBXG7jNW5CdcdKs8ln8JOmn6S2SRkoXoJx+2UwC+ZvjflfnOdHJx0SfQ9/YjlxVYLtGQ==` |
| npm tarball SHA-256 | `62112dac2d8eea337fb8bafb5c9ce5a5d3574f03e06adfe1411ae40e3cc84d97` |
| License | MIT, copyright Guilherme Rodz |
| Oracle versions | React `19.2.7`, React DOM `19.2.7`, `@types/react` `19.2.17`, `@types/react-dom` `19.2.3`, `@testing-library/react` `16.3.2` |

`upstream/` contains the byte-exact package source, the complete upstream
Playwright application and suite, and the canonical MIT license from the pinned
commit; every file verifies offline against the upstream git blob shas recorded
in `audit/upstream.lock.json`. `upstream-artifact/` contains the vendored npm
publication evidence (manifest, README, and the published `.d.mts` declaration),
hash-pinned by `audit/verify-provenance.mjs`. The pinned license is republished
at the package root as `LICENSE.upstream`. Both evidence trees must remain
excluded from the published package files.

The 1.5.0 repository moved the Playwright suite from `apps/test` to
`apps/playground` and added `pwm-space.spec.ts`. MIT still permits this
redistribution: the source LICENSE, source `package.json`, and published
`package.json` all declare MIT.

Run `node packages/input-otp/audit/verify-provenance.mjs --negative-controls`
from the repository root to reject modified, missing, or extra vendored files;
runtime/type export drift; missing or renamed browser cases; stale adaptation
classifications; a reintroduced adapted skip; or an incomplete port-authored
evidence classification set.

## Public runtime export crosswalk

The published package exposes exactly five runtime exports: `OTPInput`,
`OTPInputContext`, `REGEXP_ONLY_DIGITS`, `REGEXP_ONLY_CHARS`, and
`REGEXP_ONLY_DIGITS_AND_CHARS`. The canonical source barrel and the published
`.d.mts` declaration are checked against `audit/public-api.json`.

## Public type crosswalk

The published declaration exposes exactly three named public types:
`OTPInputProps`, `SlotProps`, and `RenderProps`. The Octane binding preserves
their names and observable strictness while replacing React-specific intrinsic,
renderable, context, and ref mechanics at the framework boundary. `OTPInputProps`
gains the 1.5.0 `nonce` field for the injected style tag; `onComplete` remains
variadic until upstream 2.0.0.

## Upstream test disposition

The canonical Playwright suite contains exactly nine spec artifacts and 19
literal test cases, all enumerated in `audit/test-inventory.json`. Every case is
classified for case-for-case adaptation. Upstream conditionally skips the Shift
selection case in CI because of its Shift-key limitation; the Octane lane must
remove that condition and execute every selection case. Port-authored
browser-conformance, DOM-conformance, differential, SSR, hydration, and public
type evidence is classified separately from the upstream identities.

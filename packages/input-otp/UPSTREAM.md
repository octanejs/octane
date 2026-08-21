# input-otp upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `input-otp` |
| Version | `1.4.2` |
| Canonical repository | `https://github.com/guilhermerodz/input-otp.git` |
| Canonical commit | `81ccdb48c010d800b24942aa231909f0c971b1ca` |
| Supported upstream range | exactly `1.4.2` |
| npm integrity | `sha512-l3jWwYNvrEa6NTCt7BECfCm48GvwuZzkoeG3gBL2w4CHeOXW3eKFmf9UNYkNfYc3mxMrthMnxjIE07MT0zLBQA==` |
| npm tarball SHA-256 | `372ada860a04000a06a9bd10732e0ea79a2587c473e6a738930728529de51c77` |
| License | MIT, copyright Guilherme Rodz |

`upstream/` contains the byte-exact package source, the complete upstream
Playwright application and suite, and the canonical MIT license from the pinned
commit; every file verifies offline against the upstream git blob shas recorded
in `audit/upstream.lock.json`. `upstream-artifact/` contains the vendored npm
publication evidence (manifest, README, and the published `.d.mts` declaration),
hash-pinned by `audit/verify-provenance.mjs`. The pinned license is republished
at the package root as `LICENSE.upstream`. Both evidence trees must remain
excluded from the published package files.

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
renderable, context, and ref mechanics at the framework boundary.

## Upstream test disposition

The canonical Playwright suite contains exactly eight spec artifacts and 15
literal test cases, all enumerated in `audit/test-inventory.json`. Every case is
classified for case-for-case adaptation. Upstream conditionally skips the whole
selection artifact in CI because of its Shift-key limitation; the Octane lane
must remove that condition and execute all three selection cases. Port-authored
browser-conformance, DOM-conformance, differential, SSR, hydration, and public
type evidence is classified separately from the upstream identities.

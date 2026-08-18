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

`upstream/source/` contains the byte-exact package source, the complete upstream
Playwright application and suite, and the canonical MIT license from the pinned
commit. `upstream/npm/` contains the complete unpacked npm publication artifact.
Both evidence boundaries are locked file-by-file by `upstream/SHA256SUMS` and
must remain excluded from the published package files.

## Public runtime export crosswalk

## Public type crosswalk

The published declaration exposes exactly three named public types:
`OTPInputProps`, `SlotProps`, and `RenderProps`. The Octane binding preserves
their names and observable strictness while replacing React-specific intrinsic,
renderable, context, and ref mechanics at the framework boundary.

## Upstream test disposition

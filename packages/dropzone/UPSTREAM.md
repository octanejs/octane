# Upstream provenance

`@octanejs/dropzone` is pinned to `react-dropzone@20.0.0`, canonical commit
`01fc05c5996bf615caf812627f7491375e647c7d`, under the MIT license. The supported
upstream range is exactly `20.0.0`. The pristine oracle is React 19.2.8, React DOM
19.2.8, Vitest 4.1.10, jsdom 30.0.1, TypeScript 7.0.2, and Node >=22 as locked by
the canonical `package-lock.json`.

The npm tarball SHA-256 is
`e76faa61389e085518b0d8492a7970e9ce4c060e4a2e9181b1eb089805afb95d` and the
canonical GitHub commit archive SHA-256 is
`947a1def85a3f7ef5b3ef74550cd60cc507389f4b08d3a6af1ba7b6646ce6a3e`.
`upstream/npm` contains all 11 published files byte-for-byte. `upstream/canonical`
contains the byte-exact license, package/test/type/build configuration, two runtime
specs, snapshot, runtime source, and all nine type programs required by U1. The
vendored evidence is development-only and excluded from package `files`.

U1 is an architecture gate, not a full parity claim. Its authored `src` is the
smallest public-shaped implementation needed to prove Octane prop getters, refs,
native input/drop events, async supersession, SSR/hydration, and package conditions.
The exhaustive U5 evidence is committed in `audit/react-parity.json`,
`audit/test-classifications.json`, `audit/transformation-ledger.json`, and the runtime/type
inventories. Every one of the 218 upstream runtime cases and all nine upstream type programs is
accounted for, with pristine React, adapted Octane, differential, SSR/hydration, and trusted
Chromium lanes executed by the repository React-parity harness.

## U1 public surface boundary

Runtime exports: default `Dropzone`, `useDropzone`, and `ErrorCode`.

Type exports: `Accept`, `AcceptGroup`, `DropEvent`, `DropzoneInputProps`,
`DropzoneOptions`, `DropzoneProps`, `DropzoneRef`, `DropzoneRootProps`,
`DropzoneState`, `FileError`, `FileRejection`, `FileWithPath`, and
`ValidatorResult`.

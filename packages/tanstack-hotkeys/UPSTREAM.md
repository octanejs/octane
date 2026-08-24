# TanStack React Hotkeys upstream ledger

`@octanejs/tanstack-hotkeys` targets `@tanstack/react-hotkeys@0.10.0` from
`https://github.com/TanStack/hotkeys.git`.

## Immutable pin

- Tag: `@tanstack/react-hotkeys@0.10.0`
- Resolved commit: `c73a3a167c979d500e1008341ecad096a6c4e635`
- npm archive SHA-256: `1ac05739e0b649ffbc5fb7954fcd7106456de9c337660ca5db3242ae14b9758d`
- npm lock integrity: `sha512-GwOSndI5j3qBVYTmgP1mYyRTnlxb2MS17cwGlsavSxMQPSnmDf+m3LzMIpRMs+3zzQMjg3cYhHsFYizYlFI2tw==`
- Supported range: exactly `0.10.0`
- License: MIT
- React oracle: workspace-pinned React and React DOM
- Framework-neutral core: exact `@tanstack/hotkeys@0.8.0`, reused by both adapters

## Source, exports, and suites

The byte-exact tagged adapter directory is vendored under `upstream/` and pinned by
`audit/upstream.lock.json`: each committed file verifies offline against its upstream git blob
sha at the pinned commit (`pnpm react-port:materialize run --check --package-dir
packages/tanstack-hotkeys`). The upstream MIT license is retained byte-exact as
`LICENSE.upstream`, hash-matched to the lock.
The lock authenticates all 25 adapter files: 13 source files, four runtime test files, and
eight package/build/documentation files. The runtime suite has 41 cases. Upstream's `test:types` script compiles package source with `tsc`; that lane runs pristine, and an
Octane `tsrx-tsc` typetest lane covers the adapted surface including the plain target-ref divergence.

`audit/upstream-crosswalk.json` accounts for both published entrypoints, all 22 adapter exports,
the byte-identical core wildcard re-export, and all four canonical runtime test files. The runtime suite runs pristine and adapted in full under `provenance.verification: verified`.

## Executable evidence

Executable evidence includes the pristine 41-case upstream Vitest suite, the adapted Octane port of
those cases, pristine/adapted type compilation, and one repo-authored differential lifecycle.
Existing local tests remain Octane framework contracts and are not counted as React parity.

The only structured adapter divergence is the target-ref type: Octane accepts a plain
`{ current }` object instead of `React.RefObject`; runtime ref detection and behavior otherwise
follow upstream.

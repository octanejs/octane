# Upstream provenance

This binding targets `react-syntax-highlighter@16.1.1` exactly.

- npm package: `react-syntax-highlighter@16.1.1`
- npm SHA-1: `928459855d375f5cfc8e646071e20d541cebcb52`
- npm integrity: `sha512-PjVawBGy80C6YbC5DDZJeUjBmC7skaoEUdvfFQediQHgCL7aKyVHe57SaJGfQsloGDac+gCpTfRdtxzWWKmCXA==`
- npm file count: 1,995
- npm unpacked size: 2,191,137 bytes
- repository: `https://github.com/react-syntax-highlighter/react-syntax-highlighter.git`
- source commit: `ecac533ba1fce8cf4f98a79c5c913f1a7ffab34c`
- license: MIT, copyright Conor Hastings

The retained `upstream/` tree contains the exact source commit's `src/`,
`__tests__/`, snapshots, `LICENSE`, and `package.json`; every file verifies
offline against the upstream git blob shas recorded in
`audit/upstream.lock.json`, and the pinned license is republished at the
package root as `LICENSE.upstream`. The exact npm tarball is retained under
`upstream-artifact/`, hash-pinned by `audit/upstream-files.json`. The tagged
repository supplies the test oracle that is absent from the published tarball.

The published Octane package excludes `upstream/`, `audit/`, `scripts/`, tests,
and type tests. Runtime compatibility is owned by generated Octane entrypoints
and executable parity lanes, not by shipping the retained React sources.

The published npm surface contains 1,316 files under `dist/` across ESM and CJS
trees: 197 Highlight.js language modules, 300 Prism language modules, 99
Highlight.js style modules, and 47 Prism style modules per module format.
`audit/public-entrypoints.json` and the generated package export map verify all
2,634 public specifiers, including extensionless aliases.

`audit/react-parity.json` is the executable parity contract. Its generator
fails closed when the pristine or adapted suite gains, loses, or renames a test,
when a selected evidence case loses its marker, or when retained evidence
changes without regeneration.

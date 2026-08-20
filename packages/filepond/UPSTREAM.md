# Upstream provenance

`@octanejs/filepond` is pinned to `react-filepond@7.1.3`.

- package: `react-filepond@7.1.3`
- repository: https://github.com/pqina/react-filepond
- tag: none for 7.1.3
- npm gitHead: `dfa6a7b4fc5dad12b08ca2732d7e0d78b5a74a95`
- advertised range: `7.1.x`
- license: MIT
- npm integrity: `sha512-uQOCZt+YXnBfYn6OxK6vsgSoUROkBu/ZahcfIJnK94c1ZeSAS84L/XKDADq/8Adx/Lz88VtVWvUpTXnNpmjHFQ==`
- npm shasum: `0ccd176f1444a7acf332db78b8d7c6966d55e493`
- reused core: `filepond@4.32.12` MIT, commit `315f6f67f6efd72ce67ee8ab2bc937deea71a265`, integrity `sha512-wro0/deLwua9CkL7HJygOlDaPo1c7Ov8kfzbZjH7m4hdi56gdHGDeRWnYa+qXnRm3Lty69gUGVFb3JZy/9vT8g==`

## Source boundary

- `upstream/react-filepond/` is the published React adapter (lib, types, LICENSE).
- `upstream/filepond/` is the tagged vanilla core used as the runtime dependency.
- The Octane package depends on `filepond@4.32.12` and reimplements only the React class wrapper as a function component.

Vendored evidence is development-only and excluded from package `files`.

## Export crosswalk

| Upstream export | Octane status | Evidence / divergence |
| --- | --- | --- |
| `FilePond` | Ported as a function component | `src/FilePond.tsrx`; `tests/filepond.test.ts` |
| `registerPlugin` | Reused verbatim from `filepond` | `src/index.ts`; `tests/filepond.test.ts` |
| `FileStatus` | Reused verbatim from `filepond` | `src/index.ts`; `tests/filepond.test.ts` |
| `FilePondProps` | Ported; adds an Octane `ref` handle | `src/FilePond.tsrx` |

## Upstream test disposition

| Upstream artifact | Disposition |
| --- | --- |
| `react-filepond` unit tests | None. The pin ships an example app only. |
| `filepond` core `src/js/__tests__/*.test.js` | Out of scope: vanilla core, not the React binding. Reused via the npm dependency. |

Octane coverage is `tests/filepond.test.ts` (wrapper + file input, re-exports, pond create when supported, destroy on unmount). These are Octane-only framework-contract tests.

## Intentional divergences

- `FilePond` is a function component, not a class. Imperative pond methods are not copied onto a class instance.
- Consumers read the pond through a `ref` handle `{ pond }` (plus the same non-filtered instance methods copied onto that handle). Call `ref.current.pond.addFile(...)` or `ref.current.addFile(...)` after mount; do not treat the component function as an instance.

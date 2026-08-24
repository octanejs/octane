# Upstream provenance

- Repository: <https://github.com/dominictobias/react-image-crop>
- Package/version: `react-image-crop@11.1.2`
- Commit: `2cd4d49b36ec9a29a63b27394ec29ade5646dc99`
- License: ISC
- npm integrity: `sha512-+0Pc2fxpwKL4u4oLmdKBw8XSwUceFbXbKEHvFOlsl/MGB1OVNic4uBlAPmEHGXYgoJIq+b63xHbc/aJMG0AVkA==`
- Advertised compatibility target: exactly `11.1.2`

## Source boundary

`upstream/src/` is the byte-exact canonical repository source at the pinned commit. `upstream/npm/` records the published npm source payload, while `upstream-artifact/ReactCrop.css` records the generated stylesheet from the pinned npm tarball with only a repository-final newline added. The Octane port:

- converts `src/ReactCrop.tsx` from a React `PureComponent` to the hook-backed `src/ReactCrop.tsrx` function component;
- reuses the framework-neutral `types.ts`, `utils.ts`, and `addons/browserCrop.ts` source unchanged;
- publishes `src/ReactCrop.css`, copied from the pinned npm distribution's compiled Sass output with only Vite's trailing build sentinel omitted;
- keeps native pointer and keyboard events and preserves the public callback name `onChange`.

The vendored `upstream/` tree is development evidence and is not included in the published package.

## Export crosswalk

| Upstream export | Octane disposition | Evidence |
| --- | --- | --- |
| `ReactCrop` | Ported to an Octane function component; class instance storage is represented by refs and local state by hooks. | `tests/image-crop.test.ts` |
| `default` | Alias of `ReactCrop`, matching upstream. | `tests/image-crop.test.ts` |
| `Component` | Legacy alias of `ReactCrop`, matching upstream. | `tests/image-crop.test.ts` |
| `ReactCropProps`, `ReactCropState` | Ported to native DOM event types and `OctaneNode`; the public property names and crop callback shapes are preserved. | `src/ReactCrop.tsrx` |
| `Crop`, `PixelCrop`, `PercentCrop`, `Ords`, `XOrds`, `YOrds`, `XYOrds` | Reused framework-neutral public types. | `src/types.ts` |
| `defaultCrop`, `clamp`, `cls`, `areCropsEqual` | Reused framework-neutral utilities. | `src/utils.ts` |
| `makeAspectCrop`, `centerCrop` | Reused framework-neutral crop construction utilities. | `tests/image-crop.test.ts` |
| `convertToPercentCrop`, `convertToPixelCrop`, `containCrop`, `nudgeCrop` | Reused framework-neutral crop conversion and constraint utilities. | `src/utils.ts`, `tests/image-crop.test.ts` |
| `cropToCanvas`, `cropToImg` | Reused framework-neutral browser crop helpers. | `src/addons/browserCrop.ts` |
| `./dist/ReactCrop.css` | Mapped to the compiled CSS in `src/ReactCrop.css`. | `tests/image-crop.test.ts` |
| `./src/ReactCrop.scss` | Compatibility export mapped to compiled CSS because published packages ship authored consumable source, not a Sass build requirement. | `tests/image-crop.test.ts` |

## Upstream tests

The canonical repository at the pinned commit has no unit-test files, test configuration, or `test` package script. Its scripts are `dev`, `build`, `lint`, `preview`, and `prepare`, and its `src/demo/` application is a manual demonstration rather than a test suite. This conclusion comes from the pinned repository metadata and tree, not from the npm tarball's contents.

The Octane package therefore supplies focused package-authored behavior tests for rendering, crop styling, native pointer updates, crop utilities, aliases, and stylesheet exports. These tests are Octane framework-contract evidence; they are not presented as an adapted upstream suite.

## Intentional framework adaptation

Octane has no class components or synthetic event objects. `ReactCrop` is a named function component using Octane hooks, and its handlers receive native `PointerEvent` and `KeyboardEvent` objects. The public API and crop math are otherwise preserved at the pinned release.

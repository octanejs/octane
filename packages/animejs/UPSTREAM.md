# Anime.js upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `animejs` |
| Version | `4.5.0` |
| Canonical tag | `v4.5.0` |
| Canonical tag commit | `2c9cf8ea00329f6768c7d7902252ed977d75ce42` |
| Supported upstream range | exactly `4.5.0` |
| License | MIT, © Julian Garnier |

Anime.js is framework-neutral. This package depends on the published release and
re-exports its runtime and declarations instead of copying or modifying the
animation engine. The npm artifact contains compiled `dist/` modules and types;
the canonical tagged repository additionally contains source, browser suites,
playgrounds, examples, and build configuration. The binding reuses the published core unchanged. The bounded audit snapshot
under `upstream/` retains the hash-verified runtime modules and suites needed for
provenance and declaration evidence; it is excluded from the published package.

## Public entry-point crosswalk

| Upstream entry point | Octane disposition | Evidence |
|---|---|---|
| `animejs` | Reused unchanged at the root; `useAnimeScope` is the sole additional runtime export | `tests/exports.test.ts`, `tests/types/public-api.test-d.ts` |
| Every published runtime subpath, including `adapters/three`, `adapters`, and nested `easings/*` entries | Re-exported unchanged at the matching `@octanejs/animejs/*` entry point | `tests/exports.test.ts`, `tests/types/subpaths.test-d.ts` |
| `animejs/package.json` | Corresponding binding metadata is available at `@octanejs/animejs/package.json`; identity and version describe this binding | package manifest |

The export contract covers all 23 runtime entry points from Anime.js 4.5.0.
Subpath tests compare namespace keys and individual runtime identities with the
installed upstream module. Type assertions compare each added namespace against
the upstream declaration and reject invalid timeline control arguments.
The Octane hook, scoped lifecycle, SSR behavior, and Three integration remain
covered by their existing suites.

## Upstream test-suite disposition

The canonical tag contains 32 runtime suites and one checked-JavaScript type
suite under `tests/suites/`. The npm
artifact does not publish them. The 31 browser runtime suites exercise the unchanged
Anime.js engine and are upstream-core evidence rather than Octane binding
fixtures: `animatables`, `animations`, `build`, `callbacks`, `colors`,
`controls`, `directions`, `draggables`, `eases`, `engine`,
`function-based-values`, `keyframes`, `leaks`, `parameters`, `promises`,
`scope`, `scroll`, `seconds`, `stagger`, `svg`, `targets`, `text`, `threejs`,
`timelines`, `timings`, `transforms`, `tweens`, `units`, `utils`,
`values`, and `waapi`. They are not adapted because the binding does not
replace those modules; export identity tests prove it delegates to the same
installed implementation.

The remaining `node.test.js` suite is likewise an upstream-core environment
suite and is not copied into the package. Octane-specific evidence is classified
as follows:

- `tests/exports.test.ts`: Octane-only package-boundary contract.
- `tests/scope.test.ts`: Octane-only lifecycle, cleanup, selector isolation,
  registered-method, completion, refresh, and error-restoration contract.
- `tests/ssr.test.ts`: Octane-only SSR safety contract.
- `tests/three-adapter.test.ts`: Octane integration contract for the unchanged
  upstream adapter and real `@octanejs/three` objects.
- `tests/types/public-api.test-d.ts`: Octane package-declaration contract.

There is no React binding or React oracle in Anime.js 4.5.0, so React/Octane
differential and adapted React type lanes are not applicable.

## Verification limits

The added subpaths pass namespace and runtime-identity comparisons, strict
authored-source checks, and the existing client/SSR lifecycle suite. Each new
subpath also bundles to byte-identical minified browser output compared with
the same direct upstream import.

The repository's full binding evidence gate remains incomplete. It requires
strict compilation of pristine upstream type suites, while Anime.js 4.5.0
publishes a non-strict checked-JavaScript program. The unchanged
`types.test.js` passes its original non-strict mode but fails strict checking
with implicit-any and possibly-undefined callback parameters. The immutable
source and strict gate have both been preserved.

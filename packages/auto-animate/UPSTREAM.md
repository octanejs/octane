# Upstream provenance

`@octanejs/auto-animate` is pinned to `@formkit/auto-animate@0.10.0`.

- repository: https://github.com/formkit/auto-animate
- tag: `0.10.0`
- tag commit: `b6a6feebf75c198dd85f280c549bc0303f9e7aa8`
- advertised range: `0.10.x`
- license: MIT
- npm integrity: `sha512-KGomRttjUfORuPUaR/ZGQw+6xfMrTM+sxnILv7JAd9AmabU9rg9i6gF/iC0Ih+QpKCubJpCA/1DX9UHKE8cX+A==`
- npm shasum: `0eadd565f50e54e5dc6f29c41b32d32b53661eab`

## Source boundary

- `upstream/src/` is the canonical tagged source (vanilla core, framework adapters, tests, LICENSE).
- `upstream/npm/` is the published tarball (compiled `index.mjs` / `react/index.mjs`).
- The Octane package depends on `@formkit/auto-animate@0.10.0` and re-exports the vanilla core. Only `src/react/` is a port of `upstream/src/react/index.ts`.

Vendored evidence is development-only and excluded from package `files`.

## Export crosswalk

| Upstream export | Octane status | Evidence / divergence |
| --- | --- | --- |
| `autoAnimate` (`.`) | Reused verbatim from `@formkit/auto-animate` | `src/index.ts`; `tests/auto-animate.test.ts` |
| default export | Reused verbatim | `src/index.ts` |
| `getTransitionSizes` | Reused verbatim | `src/index.ts` |
| `vAutoAnimate` | Gap | Vue directive on the root package; Octane has no Vue renderer |
| `AutoAnimateOptions` / `AutoAnimationPlugin` / `AnimationController` | Reused types | `src/index.ts` |
| `./react` `useAutoAnimate` | Ported | `src/react/index.tsrx`; `tests/auto-animate.test.ts` |
| `./vue` | Gap | Other-framework adapter; Octane has no Vue renderer |
| `./preact` | Gap | Other-framework adapter |
| `./solid` | Gap | Other-framework adapter |
| `./angular` | Gap | Other-framework adapter |
| `./nuxt` | Gap | Nuxt module |
| `./marko` | Gap | Marko tag |
| `./qwik` (source only) | Gap | Not a published npm export at this pin; source exists in `upstream/src/qwik` |

## Upstream test disposition

| Upstream artifact | Disposition |
| --- | --- |
| `upstream/src/index.ts` (vanilla) | Reused via npm dependency; not rewritten |
| `upstream/tests/` Playwright e2e (`tests/*.spec.ts`, multi-framework) | Out of scope: browser e2e across Vue/Preact/Solid/Angular/Nuxt/Marko/Qwik. Recorded as a gap, not skipped in-repo. |
| `playwright.config.ts` | Out of scope with the e2e suite |

Octane behavioral coverage is `tests/auto-animate.test.ts` (hook ref attach, enable/disable, omitted options). It is Octane-only framework-contract coverage because upstream ships no Vitest unit suite for the React hook.

## Intentional divergences

- Compiler-injected hook slots may occupy the `options` argument; a `symbol` is treated as omitted options.
- Non-React framework entry points are not published on `@octanejs/auto-animate`.

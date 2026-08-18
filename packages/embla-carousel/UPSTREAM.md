# Upstream Embla Carousel React audit

This port targets the immutable `embla-carousel-react@8.6.0` release.

- Repository: `https://github.com/davidjerleke/embla-carousel`
- Tag commit: `0fe65834136f1aa35e4c1a4a477e5ccb4bb5ee54`
- npm integrity: `sha512-0/PjqU7geVmo6F734pmPqpyHqiM99olvyecY7zdweCw+6tKEXnrE90pBiBbMMU8s5tICemzpQ3hi5EpxzGW+JA==`
- Runtime/core oracle: `embla-carousel@8.6.0`
- Reactive utility oracle: `embla-carousel-reactive-utils@8.6.0`
- React oracle: `react@19.2.7` / `react-dom@19.2.7` (exact; required differential lane)
- React types: `@types/react@19.2.17` (exact; declaration consumer matrix)
- Advertised compatibility: exactly the 8.6.0 React adapter surface

The MIT-licensed tag supplied the byte-exact files in `upstream/`. The npm
artifact supplied the declaration and bundle check; it contains no source or
tests. Vendored evidence is excluded from the published `files` list.

## Export crosswalk

| Upstream root export | Octane disposition | Evidence |
| --- | --- | --- |
| `default` (`useEmblaCarousel`) | Ported with `octane` hooks | `tests/conformance/binding.test.ts` |
| `UseEmblaCarouselType` | Ported without semantic change | `typetests/public.test-d.ts` |
| `EmblaViewportRefType` | Ported without semantic change | `typetests/public.test-d.ts` |
| `./package.json` | Package metadata export | package pack check |

## Source and test disposition

| Upstream artifact | Disposition |
| --- | --- |
| `embla-carousel-react/src/index.ts` | Mirrored by `src/index.ts` |
| `embla-carousel-react/src/components/useEmblaCarousel.ts` | Ported module-by-module; only the framework hook import and formatting differ |
| `embla-carousel-reactive-utils/src/components/utils.ts` | Reused unchanged from the published framework-neutral dependency |
| `embla-carousel-reactive-utils/src/index.ts` | Reused unchanged from the published framework-neutral dependency |
| `embla-carousel-reactive-utils/src/__tests__/utils.test.ts` | Upstream suite registered as the `embla-pristine-utils` parity lane (`embla-carousel-pristine-utils`) |
| React adapter tests | No test files exist at the pinned tag; `package.json`'s test script reports no tests |
| Upstream type tests | None exist at the pinned tag; pristine declaration consumption and adapted public types are checked locally |

## Differences

There are no consumer-visible API divergences. Octane compiles the hook calls
to stable call-site slots and uses native callback refs; neither changes the
published tuple contract.

Real pointer physics and layout remain owned by the unchanged Embla core. The
adapter suite uses a controlled constructor boundary because jsdom has no
layout. An unpaired Octane browser harness under `tests/browser` opts into
`testExecution.group: heavy-browser` and runs in Chromium via the generic
heavy-browser discovery lane. It verifies nonzero layout, scrolling, selection
updates, and destroy cleanup. Browser behavior is not simulated with jsdom
geometry mocks.

Every port-authored runtime test and repo-authored type probe is classified in
`audit/test-classifications.json`. Unpaired conformance/browser/hydration/SSR
cases stay Octane-only and outside React-parity ownership. The required
pristine/adapted type probes are `repo-authored-type-oracle` evidence paired
with the type-parity lanes; the required differential lane is the React runtime
oracle and rejects React/ReactDOM version drift from the pins above.

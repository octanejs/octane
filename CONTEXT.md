# Octane — domain glossary

Working vocabulary for architecture reviews and code navigation. Names here are
the seams as the codebase means them; prefer these terms over generic ones.

## The differential rig

Every `packages/<lib>/tests/differential/` project proves the same contract: the
SAME `.tsrx` fixture runs through Octane *and* through a real React oracle, and
the DOM (or SSR HTML) must agree byte-for-byte after each scripted step.

Two halves, one seam:

- **Producer — fixture precompile** (`test-utils/differential-precompile.ts`).
  A Vitest `globalSetup` pipeline: find fixtures, compile each through
  `@tsrx/react`, lower with esbuild, rewrite authored specifiers onto the real
  React-side package, write to the package's `.react-cache/`. This used to be
  ~80 private copies drifting apart; it is now one module configured per
  package.
- **Consumer — the rig** (`packages/octane/tests/differential/_rig.ts`, plus
  forks like `_styled-rig.ts`). Mounts the authored `.tsrx` under Octane and the
  cached oracle file under React, drives `step()`/`observe()`, and asserts
  `normaliseHtml` parity. The two halves meet at the cache-name contract —
  `fixtureCacheName`/`fixtureCachePath` — which both sides now import from the
  shared module instead of duplicating a hash by comment.

### The `.react-cache` contract

- Each package's setup writes `<slug>-<hash(srcPath)>.js` into its own
  `.react-cache/` so the compiled oracle resolves that package's own React +
  upstream deps. The cache dir is deleted and rebuilt on every setup run —
  stale entries can never outlive their fixture.
- The oracle toolchain (`@tsrx/react`'s `compile`, esbuild's `transformSync`)
  resolves package-locally: `_setup.ts` passes `depsFrom: import.meta.url` and
  the module `createRequire`s the package's own pinned versions inside
  `setup()`. `@tsrx/react` does not resolve at repo root, and lazy resolution
  keeps `esbuild` out of jsdom-hosted test imports.
- `fixtures: 'all'` walks the fixture dir recursively; a `string[]` is the
  declared parity contract and always throws on failure. `match` filters
  walked filenames (e.g. `/-diff\.tsrx$/` where `_fixtures` mixes oracle and
  non-oracle sources). `onError: 'skip'` exists for dirs containing
  octane-only syntax `@tsrx/react` legitimately rejects; `rejectResidualOctane`
  fails a compile that leaves `@octanejs/*`/`octane` imports behind (the oracle
  must not execute Octane code).
- Bespoke lanes stay bespoke: `shadcn`/`tanstack-devtools` vendor upstream
  modules before fixtures, `tanstack-pacer` reads its fixture list from
  `audit/react-parity.json`, `lucide` writes a React-side `icons-runtime.js`
  facade into the cache, and `remix-router` runs a second `differentialSetup`
  for its SSR lane (`.react-cache-ssr`). They delegate the fixture step to
  `compileReactFixture` or wrap `differentialSetup`, keeping the policy — not
  the pipeline — local.

---
"octane": patch
---

Ship a built package to npm (JS + type declarations) instead of raw TypeScript source.

Previously `octane`'s `main`/`module`/`types`/`exports` pointed at `src/*.ts`, so the
published tarball contained raw `.ts` — which a plain Node SSR server or any consumer that
doesn't transpile `node_modules` could not import.

- A new build (`pnpm --filter octane build`, run automatically from `prepack`) transpiles the
  runtime to ESM `.js` + emits `.d.ts`, and copies the already-JS compiler, into `dist/`.
- `publishConfig` repoints `main`/`module`/`types`/`exports` at `dist/` **only when
  published** — the workspace, tests, and examples keep importing `./src` directly, so local
  dev needs no build step.
- Relative imports in the runtime now carry explicit `.js` extensions, so the emitted JS and
  declarations resolve under Node ESM and `node16`/`nodenext` consumers (not just bundlers).

The published package now loads in plain Node ESM with no transpiler. No API or behavior change.

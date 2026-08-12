# Generic Chromium and Firefox Browser Runner

## Goal

Make the repository's existing real-browser Vitest lane execute the same consumer-observable assertions in Chromium and Firefox. The runner must be repository-generic: no binding or package receives bespoke CI orchestration, and selecting Firefox must actually launch Firefox rather than only installing its binary.

## Current state

- `vitest.config.js` owns the `octane-events-browser` project and includes `packages/octane/tests/browser/**/*.test.ts`.
- The `heavy_integration` browser lane owns the browser suites excluded from normal shards: Octane, Dexie, Tiptap, and Three.
- Every suite launches Playwright's `chromium` object directly.
- CI installs Chromium only.
- These are Vitest suites using Playwright as a library; Playwright Test project flags do not select their engine.

## Requirements

1. A neutral test utility selects `chromium` or `firefox` from a validated environment variable, defaulting to Chromium for backward-compatible local runs.
2. Unknown values fail immediately. A missing selected binary reports the selected engine and its installation command.
3. Every suite in the existing heavy-integration browser selection uses the utility; no hidden direct Chromium launch remains in that lane.
4. CI provisions and runs the exact same suite selection once per engine with `--maxWorkers=1`.
5. Normal shards continue excluding browser suites. Package-build and Astro/website integration lanes remain unchanged and execute once.
6. Workflow regression tests prove both engine entries, provisioning, environment propagation, exact suite selection, serialization, and shard exclusions.
7. Existing assertions remain consumer-observable. Engine failures are fixed or narrowly justified; suites are not broadly skipped or weakened.

## Files

- Add `test-utils/playwright-browser.ts` and focused selector/diagnostic tests.
- Adapt all direct launch sites in:
  - `packages/octane/tests/browser/`
  - `packages/dexie/tests/browser/`
  - `packages/tiptap/tests/browser/`
  - `packages/three/tests/browser/`
- Update `.github/workflows/ci.yml` browser lane only.
- Update `scripts/ci-workflow.test.mjs`.
- Add root `playwright: catalog:` development ownership and its lockfile update so
  the neutral helper resolves under pnpm's strict dependency model.
- Add a focused Vitest project/include that owns the neutral helper tests.

No package-level manifest, workspace catalog, runtime, or binding change is expected.
The root manifest and lockfile change only to declare the Playwright package that
the repository-level helper imports; the version already exists in the catalog.

## Design

The utility exposes the validated selected name, selected Playwright `BrowserType`, and a `launchBrowser()` function. It imports Playwright from the root-owned catalog dependency, reads `PLAYWRIGHT_BROWSER`; unset means `chromium`, and the only accepted explicit values are `chromium` and `firefox`. The launcher wraps only provisioning failures to add generic actionable guidance while preserving the original cause.

All browser-lane suites call the same launcher. They may still supply suite-specific launch options. Tests and diagnostics that name Chromium solely because of the old hard-coded launcher become engine-neutral.

The CI browser lane uses an engine matrix. Each entry installs its selected browser with dependencies, exports `PLAYWRIGHT_BROWSER`, and invokes the unchanged four-directory Vitest selection serially. Other heavy-integration lanes do not acquire this matrix.

## Acceptance evidence

### Selector

- Environment unset selects Chromium.
- `chromium` selects Chromium.
- `firefox` selects Firefox.
- Any other value fails before launch.
- A missing executable reports `pnpm exec playwright install <selected-engine>` and retains the underlying failure.
- The selector test project is explicitly included in local `pnpm test` and CI;
  it cannot exist as an unowned test file.

### Static workflow

- `pnpm ci:workflow:test` proves Chromium and Firefox entries.
- Each entry installs and exports the same engine value.
- The exact Octane, Dexie, Tiptap, and Three browser directories remain selected.
- `--maxWorkers=1` remains present.
- Normal shards continue excluding browser directories.
- Package-build and Astro lanes are not multiplied.

### Runtime

Run after installing both engines:

```sh
PLAYWRIGHT_BROWSER=chromium pnpm vitest run packages/octane/tests/browser packages/dexie/tests/browser packages/tiptap/tests/browser packages/three/tests/browser --maxWorkers=1
PLAYWRIGHT_BROWSER=firefox pnpm vitest run packages/octane/tests/browser packages/dexie/tests/browser packages/tiptap/tests/browser packages/three/tests/browser --maxWorkers=1
```

Both executions must run the same files and assertions. Firefox differences in focus, native events, hydration timing, computed CSS, canvas, WebGL, or XR are investigated as real compatibility findings; an engine-specific normalization requires a documented platform reason and a focused assertion.

## Implementation sequence

1. Add selector/launcher tests first and observe the missing utility failure.
2. Implement the neutral selector and diagnostics.
3. Replace every direct Chromium launch in the existing browser lane and add a
   search-based negative gate scoped exactly to the four browser-lane directories.
4. Matrix only the heavy-integration browser lane and add workflow regression assertions.
5. Run selector, workflow, format/type, and Chromium lanes.
6. Install/run Firefox and resolve genuine cross-engine failures without broad skips.
7. Review for direct Chromium fallbacks, package-specific orchestration, weakened assertions, and unrelated changes.

## PR policy

This prerequisite is one isolated branch and one draft PR. It remains draft after green CI and automated review; a maintainer decides when it is ready for review or merge.

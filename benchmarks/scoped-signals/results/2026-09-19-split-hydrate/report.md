# Default split Hydrate template bundle audit

Production DOM compilation can reuse the existing private Hydrate template policy for compiler-extracted children with no authored fallback or override. The extraction pass certifies exact tag identities on its prepared AST; the rendering call and its generated warm plan consume the same lexical proof. Selecting only the rendering call leaves the public Hydrate warm dependency reachable and loses the reduction.

Against main `9291944a2091cdfc3f5a7a5223c8f7fdef50cc48`, the matched default-split consumer falls from **90,273 to 63,235 gzip bytes (-27,038, 30.0%)** in a complete esbuild closure. Actual Vite production code splitting reduces the initial entry by **26,974 gzip bytes**. Generic returned-value and descriptor rendering contribute to this deletion; these numbers do not attribute every removed byte to signals.

## Matched output measurements

Node 24.19.0, pnpm 11.15.1, Vite 8.1.5 and esbuild 0.28.1 on darwin/arm64. Both sources use the same frozen lock and dependency provider. Production defines, `hmr:false`, target `esnext` and esbuild minification match. gzip uses level 9; Brotli uses quality 11. [evidence.json](./evidence.json) records exact source, lock, authored fixture, runner and output hashes.

| Complete esbuild closure | Main raw | Candidate raw | Main gzip | Candidate gzip | Main Brotli | Candidate Brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Default split, absent fallback | 280,914 | 193,026 | 90,273 | 63,235 | 77,101 | 54,564 |
| Explicit `fallback={undefined}` control | 280,962 | 280,962 | 90,281 | 90,281 | 77,030 | 77,030 |

The complete closure includes the extracted query module and has no unresolved output imports. Both versions render `first:0`, handle a native click to render `first:1`, preserve button identity, and mount/clean up once. The explicit fallback control has identical output SHA.

| Actual Vite ESM chunk | Main raw | Candidate raw | Main gzip | Candidate gzip | Main Brotli | Candidate Brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Initial entry, absent fallback | 284,288 | 195,496 | 89,744 | 62,770 | 76,878 | 54,279 |
| Deferred query, absent fallback | 619 | 619 | 413 | 412 | 364 | 366 |

Chunk compression is measured separately. Independently compressed module/chunk sizes are never added into a whole-output or transfer claim. The deferred child remains code-split. Both chunks of the explicit fallback control have identical main/candidate hashes.

## Unchanged consumers and cost controls

All seven existing minimal outputs have identical whole-output SHA/raw/gzip/Brotli and public snapshots: static 24,574 gzip; hooks 28,579; context 35,477; hydrate 46,396; suspense 50,805; deferred 64,913; generic `createRoot` export 60,742. The original deferred fixture uses `split={false}` and remains unchanged, including its authored SHA `d989278c273166b281729a60a5863f27423cca9c72158d2527d32ccaaacee256`, which also matches the archived main330 fixture. This patch claims no new saving for that stock row.

All 15 public closure controls have identical output SHA/raw/gzip/Brotli: ordinary client/server, scalar/structural/control/style bindings, standalone model engine, native client/server, compiled and streamed signals, and used native app/SSR. The recorded engine and used-SSR sizes are 14,480 and 33,559 gzip bytes. This patch introduces no measured size transfer in those controls; prior landed engine/SSR tradeoffs remain in the baseline. Export/loading smoke is narrower than DOM lifecycle integration.

## Admission and lifecycle contract

Only this extraction pass can certify its generated loader and child ABI. The private WeakMap associates the prepared AST with original tag nodes and is never populated from authored attributes or parser metadata. The compiler additionally resolves the actual named Hydrate import binding. A COW rewrite that loses certified identity fails closed.

Disabled splitting, independent/permanent-static boundaries, namespace or unsupported tags/attributes, spreads, authored `children`, any `__*` override, fallback including explicit undefined/null, and shadowed bindings retain the general route. Existing unsupported function-child extraction diagnostics remain. Development, HMR, profile, server and universal compilation retain their existing policies. Compiled templates still preserve generic policies for forwarded renderable and signal holes.

Runtime/index source is unchanged. Both calls reuse the previously shipped private body and the existing preload/strategy, capture update, Suspense, error, abort, retry, adoption and transition lifetime. The real non-null empty pending body remains. No additional per-node/per-binding policy allocations are introduced. Compiler bookkeeping adds a tag-set classification and identity lookup; no CPU speed or zero compiler-cost claim is made.

Eight selected-source native Chromium 149.0.7827.55 production executions compare four main/candidate consumers. Authentic SSR dormant UI activates through a trusted click and adopts the original input/button/container; drafts, focus/caret `[2,7]`, IDs, state/props updates and cleanup match. Other cases cover local empty pending with retirement before obsolete completion, authored fallback retry, and descriptor children. Warning/error and page-error capture starts before navigation and stays empty. SSR HTML uses each selected-source server compiler and public SSR implementation. This is a bounded native spot-check, not broad browser or SSR qualification.

Four deliberate mutations fail their real observation boundaries and are restored afterward: a public warm callee or lost extraction admission fails the complete-closure ratio guard; admitting an authored fallback erases visible pending output; replacing the private empty pending body with null exposes an enclosing Suspense fallback. A separate real late `octane/signals` import forwards actual handles into text/title/controlled input, updates them, preserves node identity and retires subscriptions.

## Reproduction and local checks

Use dedicated baseline/candidate checkouts, Node 24.19.0 and the same frozen lock. The committed runner uses the candidate's authored fixture and dependencies for both selected source graphs:

```sh
node benchmarks/scoped-signals/split-hydrate-size-audit.mjs /path/to/baseline-checkout . /path/to/output.json
node --test benchmarks/scoped-signals/split-hydrate-boundary.test.mjs benchmarks/scoped-signals/deferred-boundary.test.mjs
pnpm ci:workflow:test
OCTANE_COMPILE_FROZEN_AST=1 OCTANE_COMPILE_ASSERT_LOC=1 pnpm exec vitest run packages/octane/tests/compiler/split-hydrate-ast.test.ts packages/octane/tests/hydration/split-template-consumers.test.ts --project=octane --project=octane-prod
pnpm typecheck:files
pnpm format:files:check
pnpm sync
```

The new three-test deterministic guard builds complete public consumers, verifies semantics, requires a relative byte reduction, checks 17 configuration/ownership/mode controls, and includes the late actual-handle control. It is explicitly wired into the actual root `ci:workflow:test` command; that complete Node command passes 212/212 results.

Local validation also passes 298 existing Hydrate compiler results, four new public compiler-artifact tests, 24 public-test results across normal/production projects (these definitions also compile development/production consumers internally), and 247 adjacent deferred/frozen-AST/emit results. Counts overlap and are not added together. Scoped core/test/TSRX typechecks, changed-file formatting, changeset validation and sync pass with no unrelated generated diff. Full `pnpm test`, repository-wide `pnpm typecheck` and `pnpm format:check` were not run locally. Current-head CI is a separate qualification gate. No budget caps were changed and no full issue1118 regression-recovery claim is made.

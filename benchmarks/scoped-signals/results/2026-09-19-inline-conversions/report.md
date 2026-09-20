# Visible inline conversion mutation correction

An authored wrapped or extracted native mutator can replace `String` with a function that returns a real signal handle. The legacy inline result proof still treated that call as primitive text, so SSR threw `TypeError: n.indexOf is not a function`; other typed call shapes rendered `[object Object]` and missed live updates. This compiler correction declines the affected intrinsic inference and invalidates dependent supplied type facts while preserving the authored call and ordinary typed scalars.

The matched final baseline is `47d5d1df25ffe65a126d4593a2a457820b160efd`, incorporating the landed SSR component-frame and closed split-Context optimizations. Final compiler SHA is `8b6796001c4f0c9887949a8aedf65c1f6574059edb879f9135cdae92d5667317`. All other 203 Octane source files match this base; client runtime and public exports are unchanged. [The evidence](evidence.json) includes the complete 204-file source manifest, lock, fixture and runner hashes, exact raw/gzip/Brotli bundle comparisons, snapshots, and compiler samples. Earlier `068ead53…`/`95e6674e…` comparisons at partial compiler `f1a7…` are historical: they demonstrated the original direct/alias fixes but preceded the final optional-call chain correction. Both historical refs share the same Octane source tree; `40ff…` added the SSR frame change. Its published partial compiler `0843…` still failed all sixteen computed TS-key executions; that preserved feedback evidence is historical, and the final measurement includes the correction plus a normal merge of main `47d5…`.

## Proof boundary

Visible references are resolved through the existing lexical binding analysis and immutable `const` initializer chains. Only actual unbound Object/Reflect/global receivers, known native mutator methods, opaque computed references on those receivers, and global constructor writes invalidate the inferred builtin results. TypeScript ranges dependent on a saved constructor, qualified global constructor, or static `.call`/`.apply` are invalidated, including exact computed string keys under value-preserving TS assertions, satisfies, non-null and parentheses. These lookups only invalidate dependent facts; those shapes gain no new primitive inference.

A normal static native mutator call whose first target is an object/array literal, or an immutable `const` chain ending at that exact literal, does not directly mutate a global constructor. This keeps `Object.assign({}, props.labels)` and `const target={}; Object.assign(target, props.labels)` in their original scalar closure. Wrapped/extracted mutators and unknown targets fail closed. The compiler retains its existing assumptions about unknown getters, callbacks, and ambient mutations; this is not whole-program global immutability analysis.

## Public observations and mutants

The historical isolated original ten-form reproduction was 0/40 passes at `068ead53…` and 40/40 at partial `f1a7…` (ten forms × dev/prod × SSR/client). The final matched actual TypeScript-project witnesses—saved constructor, `.call`, and `(String?.call)?.(...)`—are 0/12 at current `47d5…` and 12/12 at final `8b67…`. Four additional computed-key witnesses are 0/16 at current main and 16/16 at final source across dev/prod and SSR/client. The committed actual-project guard also executes `.apply`, `globalThis.String` and four computed TS-key forms: nine forms × dev/prod × SSR/client (36 complete executions), with real handle notification, survivor identity, unmount and retired binding observations. Supplied ranges are produced by `createTextTypeProject`, not fabricated for those witnesses.

The new public fixture contributes 24 test results across normal/production projects. SSR→hydrate tests check server output, draft/focus/caret, adoption identity, subsequent live updates, and cleanup. The owning/nearby selection is 224/224, including twelve incoming split-Context consumer results; the actual CI-wired Node workflow is 223/223, including three new guards. Parsed ASTs are frozen and location assertions enabled for these correctness runs. These DOM observations use HappyDOM; no new native browser qualification is claimed.

Nine deliberate mutants are RED: ignored mutation, lost computed reference, retained typed proof, tainted ordinary receiver, lost fresh-literal exemption, lost constructor dependency invalidation, lost const-literal origin, lost optional-chain callee unwrapping, and omitted computed-key unwrapping. Each was restored to the exact final source hash. Test-side constructor preparation/restoration is excluded from the analyzed module so it cannot mask a missing authored mutation guard.

## Whole bundle controls

Node 24.19.0, Vite 8.1.5, esbuild 0.28.1, and the same frozen lock/tooling are used on both sides. Stock production libraries use the actual selected-source Vite compiler with IIFE output and esbuild minification; the exported root control uses esbuild ESM. All seven rows have identical whole output SHA, raw, gzip level 9 and Brotli quality 11. Public verification snapshots match.

| Stock control | Baseline/final gzip | Delta |
| --- | ---: | ---: |
| root-static | 24574 | 0 |
| hooks-state | 28579 | 0 |
| context | 35477 | 0 |
| hydrate-root | 46396 | 0 |
| suspense-transition | 50805 | 0 |
| deferred-hydration | 64913 | 0 |
| createRoot-export | 60742 | 0 |

All 15 public esbuild closure controls also have identical whole output SHA/raw/gzip/Brotli. Their existing export/engine/SSR smokes pass. `used-native-app` is size-only; live DOM behavior is covered by the new owning consumers above. These rows compare this compiler correction against its own baseline; they do not claim previous engine/model-SSR transfers were recovered, and compressed lane totals must not be added.

| Public closure | Baseline/final gzip | Delta |
| --- | ---: | ---: |
| ordinary-client | 60742 | 0 |
| ordinary-server | 17847 | 0 |
| binding-scalar | 5251 | 0 |
| binding-structural | 10455 | 0 |
| binding-controls | 3525 | 0 |
| binding-whole-style | 2630 | 0 |
| binding-scalar-controls-style | 9954 | 0 |
| engine | 14480 | 0 |
| native-client | 15894 | 0 |
| native-server | 15801 | 0 |
| compiled-plain-signals | 20599 | 0 |
| streamed-signals-bootstrap | 23519 | 0 |
| streamed-signal-results-bootstrap | 21531 | 0 |
| used-native-app | 78987 | 0 |
| used-native-ssr | 33587 | 0 |

The scalar readonly consumer is also whole-bundle identical: 26,647 gzip, direct fresh-object copy 26,660, `const` target 26,660, and `const`→`const` target 26,657. Removing either fresh-target proof produces a material roughly 37 KB gzip increase and fails the committed ratio guard. The fresh-array consumer and overlapping typed scalar facts are covered by that same public guard.

## Compiler cost

One bounded quiet compiler sample compares the exact final source with the baseline: three warm-up pairs, 12 alternating measured pairs, batch three, identical synthetic sources/options and pinned dependency graph, with GC outside samples. Output and source hashes remain stable. Frozen-AST/location debug instrumentation is disabled for timing. Values are milliseconds per compile; paired ratio IQR accompanies the median.

| Corpus | Baseline median | Final median | Paired final/base median (IQR) |
| --- | ---: | ---: | ---: |
| proof-free-fast | 1.153 | 1.224 | 1.035 (0.968–1.105) |
| proof-free-marker-aliases | 2.110 | 2.037 | 0.956 (0.939–0.997) |
| shared-50-builtin-aliases | 4.315 | 4.387 | 1.008 (0.970–1.027) |
| readonly-computed | 5.435 | 5.415 | 1.003 (0.995–1.031) |
| fresh-target-copy | 5.276 | 5.300 | 1.010 (0.981–1.035) |
| guarded-wrapped-mutation | 2.466 | 2.717 | 1.103 (1.076–1.137) |

The visible guarded mutation costs about 0.251 ms more in this sample (paired median 1.103, IQR 1.076–1.137); the shared 50-builtin-alias case costs about 0.071 ms more. The extra lexical checks and corrected generic emission are explicit tradeoffs. This is one synthetic compiler sample, not a runtime/browser/SSR speed claim or a zero-cost claim. Earlier partial-source `2a3e…`, `f1a7…` and `0843…` samples are historical; this table measures exact final `8b67…` against current `47d5…`.

## Reproduction and local validation

Use Node 24.19.0 and the frozen repository lock. From a clean checkout, install its own normal workspace dependencies with `pnpm install --frozen-lockfile --offline --ignore-scripts`, then run the committed consumer guards:

```sh
OCTANE_COMPILE_FROZEN_AST=1 OCTANE_COMPILE_ASSERT_LOC=1 \
  node --test benchmarks/scoped-signals/inline-value-conversions.test.mjs
pnpm exec vitest run packages/octane/tests/inline-value-conversions.test.ts \
  packages/octane/tests/known-string-holes.test.ts \
  packages/octane/tests/typescript-text-holes.test.ts \
  packages/octane/tests/compiler/compiler-ast-immutability.test.ts \
  packages/octane/tests/compiler/compiler-ast-emit-audit.test.ts \
  packages/octane/tests/compiler/signal-bindings.test.ts \
  packages/octane/tests/hydration/split-context-consumers.test.ts \
  --project octane --project octane-prod --maxWorkers=2 --silent=passed-only
pnpm run typecheck:files packages/octane/src/compiler/compile.js \
  packages/octane/tests/inline-value-conversions.test.ts \
  packages/octane/tests/_fixtures/inline-value-conversions.tsrx \
  benchmarks/scoped-signals/inline-value-conversions.test.mjs
```

The explicit authored `.tsrx` fixture selects `tsrx-tsc` for the program containing that import. A first invocation without the fixture selected `tsgo` and could not resolve it; the corrected command passes without source changes. The complete Node workflow command passes with a process-only `commit.gpgsign=false` override for its throwaway Git-fixture commits; authored commits retain configured signing. Its guard tokens are a strict union of the latest base plus this new file, with both fixed-style journal and incoming split-Context guards preserved exactly once.

For paired stock builds, use clean baseline/final checkouts and the unchanged committed fixtures with `node benchmarks/bundle-size/run-minimal.mjs root-static hooks-state context hydrate-root suspense-transition deferred-hydration`. This runs the repository harness; the reported historical selected-source scratch audit uses the exact fixture SHAs/options in evidence and is separate from budget qualification. The public closure audit's authored snippets and exact output evidence are retained in JSON; its temporary runner SHA identifies the matched audit, not a promised checked-in command.

Scoped types, formatting, changeset validation, and sync are local gates. Repository-wide tests/types were not run locally. PR #1161 is draft at the prior head; its draft-only skipped checks are not green, and the updated feedback/true-main merge is not yet published. No combined CI or merge claim is made.

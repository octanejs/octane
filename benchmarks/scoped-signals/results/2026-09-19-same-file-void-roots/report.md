# Same-file compiled void roots

Production function-local `const` roots can omit JavaScript-return rendering when their complete lifetime uses only stable same-module compiled void components. This applies to `createRoot` followed by proven renders and to `hydrateRoot` with a proven bare initial body. Definition IDs originate from exact authored top-level `@{}` function declarations, before arrow or return-JSX normalization. The final compiled-void fact, lexical binding identity and binding-write analysis must agree. Callee rewrites are copy-on-write and preserve authored source locations.

These are the **original unchanged** minimal TSRX fixtures, compiled directly as single modules. No separate entry fixture or import-name inference supplies the component proof.

| Consumer | Main 330 gzip | Candidate gzip | Delta | Historical gzip | Candidate − historical |
| --- | ---: | ---: | ---: | ---: | ---: |
| Static root | 62,583 | 27,583 | −35,000 | 54,306 | −26,723 |
| Hooks/state | 65,394 | 31,403 | −33,991 | 57,211 | −25,808 |
| Context | 68,606 | 68,607 | +1 | 57,492 | +11,115 |
| Hydrate root | 81,503 | 55,554 | −25,949 | 69,639 | −14,085 |
| Suspense/transition | 78,571 | 58,104 | −20,467 | 67,599 | −9,495 |
| Deferred hydration | 93,135 | 93,155 | +20 | 80,206 | +12,949 |
| Generic `createRoot` export | 61,565 | 61,565 | 0 | 53,295 | +8,270 |

Static, hooks, hydration and Suspense consumers omit the generic JavaScript-return rendering closure through their proven root ABI. Context also selects the void-root ABI, but its provider/children path retains generic component rendering. Deferred hydration and generic public root exports retain their full contracts. These results establish four large consumer reductions; they do not establish recovery of the entire unused-signals regression or attribute every historical byte to signals.

All six executable production bundles pass their existing public snapshots: text and cleanup; state/native click/effect cleanup; provider update; SSR node adoption and update; pending/resolved/transition visibility and cleanup; dormant-to-active hydration and native click.

The hydration followup reduces its complete Vite bundle from 259,659 to 174,149 raw bytes, 81,503 to 55,554 gzip, and 69,834 to 48,300 Brotli. Deferred hydration increases by 44 raw bytes and 20 gzip bytes while decreasing by 62 Brotli bytes. Fifteen separate public closure builds retain their existing export, engine and SSR smoke observations where applicable. Fourteen are byte-identical to main 330 and the creation-only parent, including standalone engine and fully used native SSR. The used native client app remains 247,072 raw bytes, with gzip −1 and Brotli +165: its entire bundle differs at only two characters, changing a minified local bootstrap identifier from `CT` to `OT` at its declaration and export. This is compressed identifier drift with an unchanged retained source graph, not deletion or transfer of policy code. No additional model/SSR retained-code transfer was observed in these controls.

## Hydration contract and cost

The public `hydrateRoot` signature and overload normalization remain generic. A common hydration body accepts the output handler; the generic wrapper supplies JavaScript-return rendering, while the compiler-only `__hydrateVoidRoot` supplies `null`. The initial block, root object and disposed-block recreation during adoption all use that same handler. Root claims, adoption, recovery, IDs, native manifests, refs, effects, cleanup and retry logic are otherwise shared unchanged.

The proof requires a bare, stable initial body before considering later renders. Descriptors, host/string/null/unknown targets, wrapped or mutable bodies, spread/optional calls and escaping roots stay generic even when a later render is proven. Body calls retain props in argument three and options in argument four; descriptor calls retain options in argument three. Replacing only the callee preserves argument evaluation and getter order.

The common-body refactor introduces one cold wrapper-to-body source call per hydration invocation unless the minifier inlines it. The existing adoption closure now captures the output-handler parameter. It introduces no new per-node or per-update callbacks or maps, but this report makes no zero-heap-cost or hydration CPU improvement claim. Pending hydration with replacement props can remount and reset an uncontrolled draft; the candidate preserves this existing parent behavior rather than promising stronger adoption.

## Provenance and reproduction

Baseline: `330bb0878b42dbc445659c5ea40494067c4ef296`. Creation-only parent: `a160dd4999f660a9cad59f2f45e4360efdffe155`. Historical checkpoint: `1ed5d2ab9c6291b734a70a102c78b25c8bcdb3d1`, reconstructed with the current lock/tooling and the same main-330 authored fixtures. Signals already existed at that checkpoint. This is a matched checkpoint comparison, not a before-all-signals build.

Node 24.19.0 on macOS ARM64; pnpm 11.15.1; Vite 8.1.5; esbuild 0.28.1; `@tsrx/core` 0.2.0, `@tsrx/oxc` 0.13.0, Alien Signals 3.2.0 and devalue 5.8.2. Lock SHA-256: `af0457e80aa081883f866fdda8aae261145eac1dd08ca9a592a0b24b3984004b`.

The matched diagnostic used Vite production library IIFEs, `target: 'esnext'`, `minify: 'esbuild'`, `process.env.NODE_ENV: 'production'`, profiling disabled, and selected authored package exports. The generic export and separate public closure controls used esbuild ESM with matching production definitions. gzip level 9 and Brotli quality 11 measure each complete retained bundle; independently compressed module sizes are never added. Fixture hashes, measured source hashes, raw bytes, compression and whole-bundle SHA values are in [evidence.json](./evidence.json). Compiler and retained-source drift checks were clean on the final immutable source.

Candidate compiler SHA-256: `34be9127a1f33209a9556eb19d7765ee67875eca6059094c7519ddf677e696fc`; proof helper: `9cfcfc54aecb70f3064f4ce152999e883edd32b2e8f8063ec4ae736fc076b37b`; runtime: `b6c15109b05ddd162888f48d29161c79c3be62890340a098c0915081388e82c5`; public index: `d005053e13a62408f61eccf1c7789cee03bd81c94bf442b630a7c0ac9cbd95a4`. The frozen full authored source manifest SHA-256 is `4dcbc6aa9a6ed404c2480e2dee3b4e8e71a51e9d1c97707675681bb75b57fc59`, computed from sorted path-to-file-SHA JSON using Python's default separators.

Use clean baseline/candidate checkouts with the same frozen lock and Node version. The existing repository harness reproduces these consumer builds and their observations:

```sh
node benchmarks/bundle-size/run-minimal.mjs root-static hooks-state context hydrate-root suspense-transition deferred-hydration
node --test benchmarks/scoped-signals/bundle-boundaries.test.mjs
pnpm exec vitest run --project octane --project octane-prod packages/octane/tests/same-file-void-root.test.ts packages/octane/tests/compiler/same-file-void-roots.test.ts
```

Diagnostic runner hashes are recorded as provenance, rather than promising access to temporary audit files. Exact size equality also depends on matching library output options and selected source paths. The repository node guard builds the unchanged static/hooks/hydration consumers plus matched `(0, createRoot)(container)` or `(0, hydrateRoot)(container, body, props)` controls that intentionally decline exact-callee proof. It verifies both public snapshots and requires the proven closure below 60% of the generic static/hooks control and 75% of the hydration control. Measured esbuild guard gzip values are 27,767 versus 62,601 for static, 31,548 versus 65,356 for hooks, and 55,597 versus 81,369 for hydration. These guard numbers use a different build configuration from the Vite table. Existing budget caps are unchanged; a matched improvement does not imply every existing budget passes.

## Compiler cost and semantic controls

A quiet same-process sample warmed both frozen compilers for three batches, then alternated twelve baseline/candidate pairs with ten compiles per batch. Authored text, filenames, production options, dependencies and Node version matched. Nonempty executable emitted output hashes stayed stable, and source/lock drift checks were clean.

| Corpus | Baseline median ms/compile | Candidate median | Paired median ratio | Paired ratio IQR |
| --- | ---: | ---: | ---: | --- |
| Original static | 0.5142 | 0.5754 | 1.1794 | 0.9894–1.2442 |
| Original hooks | 1.1253 | 1.2213 | 1.0724 | 1.0133–1.1779 |
| Original context | 1.4932 | 1.5483 | 1.0990 | 0.9925–1.1799 |
| Original hydration | 0.7567 | 0.7893 | 1.0560 | 0.9427–1.1631 |
| Root-free 100-host template | 17.8389 | 18.1119 | 1.0002 | 0.9580–1.0742 |
| 50 components and local roots | 15.0516 | 16.4980 | 1.1020 | 1.0260–1.1635 |

Small eligible-module medians add about 0.03–0.10 ms; the 50-root stress adds 1.45 ms. The root-free paired median is near parity with overlapping variability. This comparison against main 330 includes the preceding same-file createRoot proof and does not isolate the hydration extension. Modules lacking an exact runtime factory import and an authored eligible declaration perform no new lexical root-proof analysis. This sample makes no compiler speed improvement or runtime CPU claim. Raw samples, options, emitted hashes, corpus hashes and runner hash are retained in the machine evidence. The root-free corpus is the existing throughput runner's 100 `<article data-index>` template; stress generates 50 private void component declarations and ordinary mount functions, each creating, rendering and unmounting one local root.

Final local validation passed 60 public-test results across the normal and production projects, plus two public compiler source-map/frozen-AST artifact tests. The public tests also compile development/production modes internally and cover Strong mode, native events, state, uncontrolled drafts, focus/caret, DOM identity, cleanup, late opaque signal props, initial suspense, obsolete wakeables, unmount-before-resolution, structural recovery and generic descriptor/returned-value contracts.

The nearby hydration/recovery/lease/native/input run passed 266 existing integration results. Its actual 380-result invocation also included 114 owning results before optimization assertions were relocated; the corrected final owning invocation is the separate 62-result run above. The final node boundary suite passed 21 tests, including 52 fixed-source activation/mode/lifetime controls and two frozen adopted-AST positive/negative pairs. Activation and closure-size assertions live at this benchmark observation boundary, not in ordinary correctness tests. Scoped types, scoped format, changeset validation and `pnpm sync` passed.

An independent immutable-parent/final-source audit passed 40 executions: ten identical public hydration consumers, each compiled in development and production against both sources. It used authentic server-generated HTML, frozen ASTs and location assertions. Five consumers select the production void-hydration ABI; five generic negatives retain descriptors, host/unknown initial targets, mutable/shadowed bodies, root escapes and unknown later renders. All parent/candidate public snapshots match, including props/options order, identifier-prefix getter reads, draft/state/host identity, retry, replacement before an obsolete wakeable and unmount-before-resolution. These are Happy DOM observations, not native-browser or full-CI qualification.

The immutable creation-only parent fails the new hydration improvement guard with 81,358 gzip bytes on both proven and generic lanes, while both semantic controls pass. Four final deliberate mutants fail meaningful checks and restore exact source hashes: dropping the initial-target proof loses ordinary initial output; dropping unscoped-reference admission fails the frozen AST benchmark negative; dropping the generic disposed-adoption output handler loses returned retry output; disabling hydration specialization preserves behavior but fails the 81,369 versus 81,369 byte guard. Earlier creation-proof write/lexical-identity/escape/deletion/null-traversal mutants remain recorded with their original parent-source provenance.

The unscoped-reference check is conservative adopted-AST hardening. Its precise synthesized function-decorator shape is runtime-walked but lacks lexical scope metadata. Function/arrow decorators are rejected by the current authored parser, so it is not presented as a reproduced supported runtime bug. Supported class/method/field decorator escapes stay generic and preserve later ordinary text. Runtime enum/namespace write invalidation remains conservative.

The scope is production ordinary DOM function-local roots and exact same-module authored void declarations. Module-level roots, imported/wrapped/arrow/return-JSX targets, aliases, escapes, closures, unknown targets, writable definitions and direct eval decline the proof. Development, HMR, profiling, server, explicit renderer/universal/renderer-boundary modes remain generic. No public opt-in, SSR optimization, runtime CPU improvement, universal unused-signals recovery or combined-PR CI qualification is claimed.

# Same-file compiled void roots

This production compiler change selects the existing `__createVoidRoot` ABI for a function-local `const` root only when every use stays in its declaration scope and every render targets a stable same-module compiled void component. Definition IDs originate from exact authored top-level `@{}` function declarations, before arrow or return-JSX normalization. The final compiled-void fact and lexical binding-write analysis must agree. The callee rewrite is copy-on-write and preserves its authored source location.

These are the **original unchanged** minimal TSRX fixtures, compiled directly as single modules. No separate entry fixture or import-name inference supplies the proof. Runtime source and public root exports are unchanged.

| Consumer | Main 330 gzip | Candidate gzip | Delta | Historical gzip | Candidate − historical |
| --- | ---: | ---: | ---: | ---: | ---: |
| Static root | 62,583 | 27,583 | −35,000 | 54,306 | −26,723 |
| Hooks/state | 65,394 | 31,403 | −33,991 | 57,211 | −25,808 |
| Context | 68,606 | 68,607 | +1 | 57,492 | +11,115 |
| Hydrate root | 81,503 | 81,503 | 0 | 69,639 | +11,864 |
| Suspense/transition | 78,571 | 58,104 | −20,467 | 67,599 | −9,495 |
| Deferred hydration | 93,135 | 93,135 | 0 | 80,206 | +12,929 |
| Generic `createRoot` export | 61,565 | 61,565 | 0 | 53,295 | +8,270 |

Static, hooks and Suspense consumers omit the generic JavaScript-return rendering closure through their proven root ABI. Context also selects the void-root ABI, but its provider/children path retains generic component rendering. Hydration APIs and the generic public root export retain their full contracts. These remaining increases are reported openly; this does not establish recovery of the entire unused-signals regression or attribute every historical byte to signals.

All six candidate executable production bundles pass their existing public snapshots: text and cleanup; state/native click/effect cleanup; provider update; SSR node adoption and update; pending/resolved/transition visibility and cleanup; dormant-to-active hydration and native click. Fifteen separate public closure controls are byte-identical to main, including engine, native client/server, compiled plain signals, streamed signal facades, and fully used native client/SSR apps. Raw, gzip, Brotli and whole-bundle SHA values match. No model/SSR cost transfer was observed in those controls.

## Provenance and reproduction

Baseline: `330bb0878b42dbc445659c5ea40494067c4ef296`. Historical checkpoint: `1ed5d2ab9c6291b734a70a102c78b25c8bcdb3d1`, reconstructed with the current lock/tooling and the same main-330 authored fixtures. Signals already existed at that checkpoint. This is a matched checkpoint comparison, not a before-all-signals build.

Node 24.19.0 on macOS ARM64; pnpm 11.15.1; Vite 8.1.5; esbuild 0.28.1; `@tsrx/core` 0.2.0, `@tsrx/oxc` 0.13.0, Alien Signals 3.2.0 and devalue 5.8.2. Lock SHA-256: `af0457e80aa081883f866fdda8aae261145eac1dd08ca9a592a0b24b3984004b`.

The matched diagnostic used Vite production library IIFEs, `target: 'esnext'`, `minify: 'esbuild'`, `process.env.NODE_ENV: 'production'`, profiling disabled, and selected authored package exports. The generic export control used esbuild ESM/browser with matching definitions. gzip level 9 and Brotli quality 11 measure each complete retained bundle; independently compressed module sizes are never added. All fixture hashes and measured source hashes are in [evidence.json](./evidence.json). Compiler and retained-source drift checks were clean. The final null-safe source was measured again: all seven stock rows and fifteen public closure controls retained identical bundle hashes and sizes to the preceding prototype.

Candidate compiler SHA-256: `fdf81f4653e33d9087fb8a209a5b01a41f2a46bf0484f9fce4f0dc5888f48bbf`; proof helper: `b4ecfb0a686dd135a588dde57fe0e81e720fc8a38fdbadd9747de826f4749d46`; unchanged runtime: `4354f73d46dfc378c9cd580c1ab6a882a7eff3632478326413152e923faca674`. The frozen full authored source manifest SHA-256 is `68bc437046578e8a5e929c8bee97bf6f0724b2c81d8563003485cede1e3789f9`.

Use clean baseline/candidate checkouts with the same frozen lock and Node version. The existing repository harness reproduces these consumer builds and their observations:

```sh
node benchmarks/bundle-size/run-minimal.mjs root-static hooks-state context hydrate-root suspense-transition deferred-hydration
node --test benchmarks/scoped-signals/bundle-boundaries.test.mjs
pnpm exec vitest run --project octane --project octane-prod packages/octane/tests/same-file-void-root.test.ts packages/octane/tests/compiler/same-file-void-roots.test.ts
```

The diagnostic runner hashes are recorded as provenance, rather than promising access to temporary audit files. Exact size equality also depends on matching the diagnostic library output options and selected source paths. The repository node guard builds the unchanged static/hooks consumers plus a matched `(0, createRoot)(container)` control that intentionally declines exact-callee proof, verifies both public snapshots, and requires the proven closure to stay below 60% of the generic control. Measured guard gzip values are 27,767 versus 62,601 for static and 31,548 versus 65,356 for hooks. Existing budget caps are unchanged; a matched improvement does not imply every existing budget passes.

## Compiler cost and semantic controls

A quiet same-process sample warmed both frozen compilers for three batches, then alternated twelve baseline/candidate pairs with ten compiles per batch. Input text, filenames, production options, dependencies and Node version matched; every emitted result was nonempty executable JavaScript and its hash stayed stable. The new proof adds compiler work in eligible entry modules:

| Corpus | Baseline median ms/compile | Candidate median | Paired median ratio | Paired ratio IQR |
| --- | ---: | ---: | ---: | --- |
| Original static | 0.468 | 0.551 | 1.195 | 1.008–1.379 |
| Original hooks | 1.079 | 1.221 | 1.126 | 1.091–1.295 |
| Original context | 1.360 | 1.508 | 1.064 | 1.030–1.177 |
| Root-free 100-host template | 17.097 | 17.610 | 1.030 | 0.966–1.099 |
| 50 components and local roots | 14.698 | 15.507 | 1.102 | 1.039–1.207 |

The small eligible modules add about 0.08–0.15 ms by absolute medians; the 50-root stress adds 0.81 ms. Modules without an exact runtime `createRoot` import and an authored eligible declaration perform no new lexical proof analysis. This sample makes no compiler speed improvement or runtime CPU claim. Raw timing samples, options, emitted hashes and corpus hashes are retained in the machine evidence. The synthetic root-free corpus is the existing throughput runner's 100 `<article data-index>` template; the stress corpus generates 50 private `ViewN(props) @{ <main>{props.value as string}</main> }` declarations and ordinary `mountN(el)` functions, each creating/rendering/unmounting one local root with `value: String(N)`.

Local validation: 28 public-test results across the normal and production test projects (the tests also compile development/production modes internally), 24 frozen-AST/compiler proof controls, 195 tests in the actual nearby compiler run, and all 19 node bundle-boundary tests. Scoped types passed. An independent frozen-source audit passed 20 baseline/candidate consumer executions, covering call/options order, root ID prefix, props and typed input identity, hoisted captures and `@try` native reset, factory/target shadows, destructuring/eval reassignment, Map escape, and mixed template/returned-value targets.

Five deliberate mutants failed their owning checks, then their modified sources were restored exactly: ignoring writes lost replacement text; ignoring lexical identity lost shadowed-target output; admitting escaping/unknown references lost ordinary output; disabling specialization preserved public behavior but failed the byte guard at 62,601 versus 62,601 gzip; removing the final traversal admission guards threw on a public array-hole/omitted-destructuring consumer. The first four mutants preceded the null-safety addition; the fifth exercised the final source. Generic fallback controls include module-level const roots, namespaces/static blocks, returned roots, closures, computed methods, unknown targets, setup value returns, arrow/return-JSX normalization, eval, development/HMR/profile/server and explicit renderer/boundary modes. Ordinary props, state, native events, surviving DOM identity, cleanup, Strong mode, and opaque signal props after a late engine import remain observable and covered.

The scope is production ordinary DOM function-local roots and exact same-module authored void declarations. Imported/wrapped/arrow/return-JSX targets remain outside this proof; mutable or unverifiable bindings remain generic. Runtime namespace/enum syntax conservatively invalidates visible binding-write facts. No public opt-in, runtime allocation, ABI change, SSR optimization, or combined-PR CI qualification is introduced.

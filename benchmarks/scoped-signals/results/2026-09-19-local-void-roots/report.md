# Function-local roots with stable compiled component targets

This audit measures a compiler specialization of production plain TS/JS entry modules. A function-local `const root = createRoot(target)` can use the existing void-root implementation when every reference stays in its original lexical scope and every render target is an imported, compiled component with a stable void return contract. The runtime and public API are unchanged.

The export proof also rejects authored writes and direct eval that can replace a component's live binding. An actual Vite production consumer demonstrates the existing disposable-root bug: after `replace()` changes an exported component into a function returning `"replacement"`, main330 automatically selects the void root and renders empty DOM. The corrected metadata keeps the generic root and renders `"replacement"`. The compiled producer is identical in both builds (SHA-256 `1627e3386ddda7610a96e420385bcadaa296c825c4bcd8db83f0852ef4017df0`). This is an automatic adapter proof, with no supplied component facts or forced internal helper.

## Matched whole-bundle bytes

The runner derives separate plain entry and compiled view modules from the unchanged `root-static`, `hooks-state`, and `context` minimal fixtures. Every build uses the same authored features, fixture paths, selected runtime, compiler options, lock and toolchain. Sizes are whole closures; compressed module sizes are never added.

| Consumer | Main330 raw | Candidate raw | Main330 gzip | Candidate gzip | Gzip delta | Main330 Brotli | Candidate Brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Static | 197,931 | 83,633 | 62,583 | 27,583 | -35,000 | 54,294 | 24,583 |
| Hooks/state | 205,942 | 95,051 | 65,394 | 31,403 | -33,991 | 56,643 | 27,938 |
| Context | 216,895 | 216,897 | 68,608 | 68,609 | +1 | 59,319 | 59,308 |

Public observations match: static renders `Octane` and cleans up; hooks render `0`, a native click produces `1`, and effect/cleanup run once; context changes `light` to `dark` and cleans up. Context selects the void root, but its compiled `ThemeContext.Provider` subtree calls the generic `componentSlot`, which retains `renderReturnedValue`. The public `createContext` implementation also normalizes arbitrary children through `childrenAsBody` and its `childSlot` fallback. These context/provider edges retain the generic graph, so this root specialization does not reduce that closure.

Two additional paired controls use the same consumer construction and current pinned tooling:

| Consumer | Historical parent, current-lock reconstruction | Published #1139 cc21 | Main330 | Candidate |
| --- | ---: | ---: | ---: | ---: |
| Static gzip | 54,306 | 61,598 | 62,583 | 27,583 |
| Hooks/state gzip | 57,211 | 64,402 | 65,394 | 31,403 |
| Context gzip | 57,492 | 67,586 | 68,608 | 68,609 |

The historical source is `1ed5d2ab9c6291b734a70a102c78b25c8bcdb3d1`, reconstructed with the current lock. Signals already existed at that checkpoint; it is not a baseline before all signals. The #1139 control is `cc21ab461429f0f6d60e3b0c7d8ae4ab2552dadf`. Those two controls used the earlier equivalent runner; their runner hashes are retained in [evidence.json](./evidence.json).

Fifteen public esbuild closure controls are byte-identical to immutable main330, including ordinary client/server, standalone engine, native client/server, compiled and streamed SSR signals, and fully used native app/SSR. Engine gzip remains 12,889 bytes, ordinary server 17,728, used app 78,310, and used SSR 31,888. There is no runtime or SSR cost transfer in this change.

## Scope and controls

Only actual function-body local const roots in plain production TS/JS entries are newly admitted. Lexical function scopes introduced by TypeScript namespaces and class static blocks do not establish this lifetime and remain generic. Direct and merged namespace exports are covered by public ordinary-renderable regressions; actual private functions inside namespaces and arrow/function-expression bodies remain positive compiler controls. Module-level const roots, exported roots, escapes, extracted methods, computed/optional calls, closures and nested scopes, unknown or dynamic render targets, full TSX/TSRX compilation, dev, HMR and profiling retain generic roots. Every render target must satisfy the actual adapter metadata; one unknown target prevents the factory rewrite.

An independent actual Vite production/native Chromium consumer verifies the namespace escape correction: the initially published candidate renders `first` then loses ordinary `replacement` text, while both main330 and the corrected proof render `first` then `replacement`, with no browser errors. The corrected source retains identical whole bundle hashes for all three measured separate-entry consumers and all fifteen public closure controls.

The consumer regressions observe props refresh, state/native events, retained typed uncontrolled DOM, identity, cleanup/unmount, escaped roots and later text renders, lexical shadows, direct eval, and mutable component exports. A late engine-import control mounts first, imports `octane/signals`, then forwards direct text/value handles and observes live updates on the retained DOM. Adopted parser ASTs are deep-frozen in the export-proof regression. Unsupported async/generator components retain the public compiler diagnostic before adapters attach any facts.

The deterministic boundary suite passes 19 cases, including 93 local-root admission/fallback controls. Its plain static consumer shrinks from 62,364 to 27,577 gzip bytes while preserving public text and cleanup. The final owning and nearby dev/prod compiler/runtime matrix passes 170 cases, including the late-engine and exported namespace regressions. Changed compiler source and new owning test programs pass scoped typecheck. Repository-wide CI remains a separate qualification.

Four deliberate mutants are rejected: admitting mutable exports loses replacement text; admitting escaped/dynamic roots loses later renderables; removing specialization fails the activation guard; retaining the generic return graph inside the void root makes both closures 62,364 gzip bytes and fails the size guard despite unchanged public behavior. All mutated source was restored to the recorded hashes.

## Reproduction and provenance

Use Node 24.19.0 and materialize dependencies from the same frozen lock in the candidate and a clean main330 source checkout. From the candidate repository root, run the two commands sequentially, with `BASELINE` pointing at that checkout and `AUDIT` at a scratch output directory:

```sh
node benchmarks/bundle-size/audit-local-void-roots.mjs --source-root="$BASELINE" --tooling-root=. --output-root="$AUDIT" --label=baseline330
node benchmarks/bundle-size/audit-local-void-roots.mjs --source-root=. --tooling-root=. --output-root="$AUDIT" --label=candidate
node --test benchmarks/scoped-signals/bundle-boundaries.test.mjs
```

The runner enforces Node and lock equality, snapshots selected authored source against drift, records derived entry/view and original fixture hashes, and invokes the existing consumer verification. It uses Vite 8.1.5, esbuild 0.28.1, production IIFE library output, `target: esnext`, `hmr: false`, `profile: false`, gzip level 9 and Brotli quality 11. Tooling also includes `@tsrx/core` 0.2.0, `@tsrx/oxc` 0.13.0, alien-signals 3.2.0, devalue 5.8.2 and JSDOM 30.0.1.

Exact baseline: `330bb0878b42dbc445659c5ea40494067c4ef296`. Its selected source archive SHA-256 is `a7bb338a40a882808d3b38da651b04f26717afc7ccdd16ec988980a1275fc2b3`. Lock SHA-256: `af0457e80aa081883f866fdda8aae261145eac1dd08ca9a592a0b24b3984004b`. Durable runner SHA-256: `f8fd05b24d29500cdc975ee38ea599ea4466002bc6e5872b78b923383119c682`.

Final implementation hashes:

- `compiler/slot-hooks.js`: `26e34b31ca5f97e8c106203e20afd70359c97746ed1aba67986071f13a430c97`
- `compiler/bundler.js`: `f9f9311f702137a6ea7863d2b3eb039aefa93c56b5c12c2e3a72b02320b6f779`
- Unchanged `runtime.ts`: `4354f73d46dfc378c9cd580c1ab6a882a7eff3632478326413152e923faca674`

[evidence.json](./evidence.json) retains exact bundle, original/derived fixture, compiler and public control hashes and measured bytes.

The static/hooks savings remove the generic returned-value graph, including work unrelated to signals. They do not measure signals-only recovery. Generic public exports and stock same-module entry shapes remain outside this extension, so the reported unused-signals regression remains for those consumers. No caps were changed. No CPU, compiler-time, browser latency or SSR speed claim is made.

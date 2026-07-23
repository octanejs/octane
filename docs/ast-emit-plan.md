# AST Emit Plan (Stage 2F)

Replace the compiler's string-assembly emit with AST construction printed by
esrap, per the original author's direction. The transform layer is already
AST→AST (builders + enforced copy-on-write and origin-location invariants);
this plan converts the remaining string domains: the runtime-glue statement
skeletons, the function/module frames, and eventually the server emitter.
Template HTML stays a string product in every milestone — its mapping channel
is the append-time origin recorder (`inspect.templates`), unchanged.

## Why

- esrap emits a complete, exact source map from one print — the custom offset
  stitching (`pasteChunk`/`joinChunks`/`_setupMaps` line bookkeeping/
  `buildSourceMap`) exists only to reconstruct what a single print knows
  natively, and every remaining unmapped region (hoisted helpers, module
  frame, server) is a hole in that reconstruction.
- The emitted-output AST becomes a value the inspection surface can expose
  directly (no re-parsing generated code).
- The string layer is wide in bytes but shallow in logic: formulaic skeletons
  around esrap-printed expression holes — mechanical to convert.

## Ground rules

- Byte-identity with the string emitter is explicitly NOT a goal — esrap's
  formatting wins. The oracles are the behavioral suites (differential,
  hydration, e2e) plus the position-relative map tests.
- Record codegen-size and compile-time baselines before each milestone; report
  deltas with the milestone. Generated-code size is a tracked cost.
- `slot-hooks.js` remains text-edit based BY CONTRACT (append-only edits keep
  user line numbers valid without a map). Do not convert it.
- All construction uses `@tsrx/core` builders with origin locations
  (`loc_info` / `inheritOriginLoc`); the frozen-AST and loc-completeness
  enforcement flags stay on and must stay green throughout.

## Milestones

### M1 — client component function interior

Convert every producer of function-body text to statement/expression nodes:

1. Path walks / element vars / bag locals (`ensureVar`, `_b.x = …`).
2. All binding emitters — `emitBindingMount`, `emitBindingUpdate`,
   `emitDeferredMount`, every kind.
3. Construct call emitters (`makeForCall`/`makeIfCall`/`makeSwitchCall`/
   `makeTryCall`/`makeCompCall`/portal/head) — the `after` lines.
4. Function preludes (autoMemo/hookMemo caches), the `let _b` +
   `if (_b === undefined) { } else { }` frame, the dev locs stash, the
   return tail.

Interim invariant (keeps every step green): converted producers return nodes;
a shim at the existing push sites prints each node (`printNodeWithMap`) into
the current chunk records, so the 2C mapping path keeps working until the
flip. The flip then makes `compileFunctionBody` build one
`FunctionDeclaration` and print it once with maps — deleting the shim, the
paste/`joinChunks` records, per-statement prints, the `inlinedSubs` body
splice, and the function-relative line bookkeeping. Inlined sub-helpers embed
as declaration nodes in the body.

### M2 — module frame

Imports/prelude, template consts, style injections, delegate calls,
HMR/profile/stamp blocks, hoisted helpers → one module AST, one print.
`buildSourceMap` is deleted; esrap's map (encoded) becomes `result.map`, and
the inspection segments read esrap's decoded output plus the existing
source-end enrichment. Boundary-pass map composition (`composeSourceMaps` /
needles) is unaffected — it composes over the final map regardless of its
producer.

### M3 — server emitter

Same treatment for the SSR codegen (`ssrCompileBody` and friends): JS
skeletons become nodes; emitted HTML chunks become template-literal quasis.
This also brings the server map to full density for the first time.

### M4 — cleanup

Delete dead string helpers (`indentCode`, splice machinery, chunk records),
update `.rulesync` guidance to name AST emit as the norm, and re-baseline the
codegen-size and compile benches as the new controls.

## Test plan

The conversion is verified against the COMPILER OUTPUT, not by re-running the
full behavioral suites per step — that is the point of keeping the frozen
baseline compiler.

Per conversion batch (fast, seconds):

1. **Differential-emit harness** — the primary oracle. A frozen snapshot of
   the string emitter (`compile-2f-baseline.js`, untracked) and the working
   compiler both compile every `tests/_fixtures/*.tsrx` across all seven
   modes (client/dev/hmr/prod/profile/server/server-dev); both outputs are
   PARSED and the ASTs compared structurally (loc/raw ignored, property keys
   canonicalized, parens transparent). Formatting differences pass; any
   semantic drift fails with the first divergent AST path. ~1,080 output
   pairs per run.
2. **Enforcement probes** — the frozen-AST and loc-completeness flags over a
   dense fixture in all modes (7-mode probe script).
3. **Compiler-output suites** — the map/inspection contracts, which are
   position-relative and therefore printer-agnostic:
   `compiler-map-coverage`, `compiler-inspect-segments`,
   `compiler-template-origins`, plus `compile-dev-loc` (emitted dev metadata)
   and a two-file runtime smoke (`basic`, `attrs-events`) to catch gross
   wiring breaks.

Per milestone, once, before its commit:

4. **Codegen-size + compile-time deltas** against the recorded baselines
   (attrs-events dev/prod byte counts; compile-median bench). Structural
   equality cannot see size — this check covers the formatting dimension.
5. **One full `packages/octane/tests/` pass** (both projects, enforcement
   flags on) as the final behavioral backstop — not used during iteration.

## Dependency audit (why nothing downstream blocks this)

- MDX composes the module map — a denser esrap map only improves it.
- Hydrate/renderer/universal passes rewrite source text pre-compile and
  compose maps post-compile — independent of the emit mechanism.
- Bundler/Vite consume `{ code, map }` — agnostic.
- Tests: the repo's testing rules forbid pinning emitted formatting; map
  tests locate positions from the output itself.

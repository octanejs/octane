# AST Emit Plan (Stage 2F)

Replace the compiler's generated-program string assembly with AST construction
printed by esrap, per the original author's direction. The transform layer is
already AST→AST (builders + enforced copy-on-write and origin-location
invariants). The end-state invariant is:

- Generated JavaScript and TypeScript syntax exists only as AST, and each
  emitted module is printed by esrap exactly once.
- Static template HTML exists as compiler-owned template IR carrying authored
  origins. It is serialized exactly once into the compact string consumed by
  the runtime, then embedded in the generated JavaScript AST as a literal.
- Runtime data that is inherently textual — HTML, CSS, module specifier values,
  diagnostics, and ordinary string literals — remains string data. It must not
  be confused with assembling JavaScript syntax through strings.

esrap prints ESTree JavaScript/TypeScript; it does not print an HTML AST. Passing
template HTML through a JavaScript `Literal` or expression-free
`TemplateLiteral` changes only its quote container and does not make the tags,
attributes, or text visible to esrap. `inspect.templates` therefore remains the
precise logical-HTML mapping channel, but is derived from and accompanied by the
template IR rather than being maintained by ad hoc string concatenation.

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
- "One print" means one final program print for each emitted module. No generated
  JavaScript fragment may be printed, interpolated into source, reparsed, or
  textually retargeted on the way to that final print. Source-preserving slices
  of authored code are not generated syntax, but must enter the final pipeline
  as parsed AST rather than as a second output emitter.
- The client runtime's `template(html, ns, frag)` string ABI remains unchanged.
  Shipping template IR as runtime object data would increase generated size and
  replace the browser's optimized HTML parser/clone path with runtime work.
- All construction uses `@tsrx/core` builders and clone helpers wherever they
  represent the required node or copy-on-write rewrite, with origin locations
  (`loc_info` / `inheritOriginLoc`). Manual node construction is reserved for
  unsupported ESTree shapes or preservation of parser-owned fields that the
  helpers cannot express. The frozen-AST and loc-completeness enforcement flags
  stay on and must stay green throughout.

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

### M4 — template IR and main-compiler closure

Close the remaining string domains in the main DOM client/server compiler:

1. Introduce a compiler-only template IR for static elements, attributes, text,
   anchors, fragments, and authored origins. `emitNodeHtml`/`emitElementHtml`
   build and compose this IR instead of growing `html`/`attrHtml` strings or
   passing origins through `_retOrigins`.
2. Serialize each completed hoisted template exactly once at `allocTemplate`.
   The serializer returns both the runtime HTML string and the existing
   `inspect.templates` spans. The module AST continues to pass that string to
   `_$template(...)` as a literal.
3. Expose the exact printable program AST and template IR under `inspect` for
   the playground. The generated-code pane reads the program AST/map; the
   template pane reads the template IR/origins.
4. Remove the residual main-compiler print/reparse bridges (`warmSrc` /
   `parseWarmExpression`, printed component-name forms, and printed-expression
   dedupe keys). Use nodes, node identity, or a structural AST key instead.
5. Delete the now-dead client/server string emitters and helpers
   (`emitServerModulePrelude`, `indentCode`, splice/chunk machinery, and the
   superseded string-form helpers).

Exit: ordinary DOM client and server compilation each perform one esrap Program
print, construct no generated JavaScript syntax as text, expose the AST used for
that print, and retain byte-identical runtime template HTML with equivalent or
better template-origin coverage.

### M5 — type and auxiliary module emitters

Bring the smaller module-producing entry points under the same invariant:

1. Add the Volar renderer pragma to the type-only AST/comment set before
   `@tsrx/core` performs its one print; remove `prelude + result.code` and manual
   mapping shifts. Expose that exact transformed Program as `generatedAst` so
   the playground's types target can render AST or generated TSX without
   reparsing.
2. Emit client-only server stubs as AST and print each stub once with a map.
3. Audit other compiler helpers returning generated modules and convert any
   remaining line-array/template-string emitters.

Exit: every type-only/Volar or auxiliary generated module exposes the AST it
printed and has no post-print source concatenation. The playground can select
the type-only Program/code/mappings as a first-class compilation target.

### M6 — universal, renderer-boundary, and hydrate pipelines

Remove the intermediate generated-source round trips:

1. Make universal lowering produce AST plus origin metadata and hand it directly
   to the main client transform instead of building `lowered` source, reparsing
   it, and textually retargeting runtime imports.
2. Convert renderer-boundary and hydrate generated scaffolds to copy-on-write AST
   transforms. Preserve authored nodes and their locations; compose origin/map
   metadata without generated-text needles.
3. Select the final runtime module/specifiers before the one Program print, so
   no output is edited after printing.
4. Audit the complete compilation chain for manually constructed AST nodes and
   replace each safe case with the corresponding `@tsrx/core` builder or clone
   helper. Cover both the newly converted emit paths and pre-existing transform
   code; document the few manual constructions that must remain.

`slot-hooks.js` is the sole intentional text-edit exception because preserving
authored line numbers without a source map is its public debugging contract.

Exit: client/dev/HMR/prod/profile, server/SSR, universal renderer, renderer
boundary, hydrate split-module, type-only/Volar, and client-only-stub outputs all
follow AST → one final print.

Builder/clone audit result: the complete compiler chain uses `@tsrx/core`
builders for supported generated nodes, including function-form conversions,
and `clone_ast_node` where a rewrite needs an independent deep subtree (such as
stylesheet transforms). Manual ESTree construction remains only where the
builder surface has no equivalent: `Program`, `ImportExpression`,
`MetaProperty`, `ChainExpression`, default-import specifiers, a dynamic
`ThrowStatement`, and a labeled `BreakStatement`. TSRX-only parser nodes,
compiler template IR records, and esrap comment records are not generated
JavaScript AST and are intentionally outside this list.

### M7 — cleanup and durable controls

Delete obsolete source-map stitching, mapping needles, generated-text origin
arrays, and compatibility helpers made dead by M4–M6. Update `.rulesync`
guidance to name AST emit plus template IR serialization as the norm. Re-baseline
codegen size and compile benchmarks, and add an audit test that fails when a new
generated-source/reparse or post-print mutation path is introduced.

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

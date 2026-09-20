# U1 spike — token contract seam (KTD1)

Date: 2026-09-20. Unit: U1 of `docs/plans/2026-09-20-1623-feat-typed-native-styling-plan.md`.
**Throwaway spike, not production code.** Everything lives behind
`packages/octane/tests/spike-token-seam/`; no shipped source was modified.

## What the spike proves

A `tokens.ts` module exporting a typed declaration
(`_fixture/tokens.ts`, using the in-progress U4 shape `defineThemeTokens` from
`octane/theme-tokens`) is read **synchronously and without evaluation** by a
host-side resolver, reduced to serializable facts `{namespace, names}`, and a
`compile()`-adjacent pass turns `var(--token)` reads inside `<style>` into
collected diagnostics. The seam mirrors the CSS-module-constants machinery:

| Production seam | Spike analogue |
| --- | --- |
| `findCssModuleImportRequests` (`css-module-imports.js:12`) | `findTokenContractImportRequests` — authored, non-type, attribute-free relative imports are candidate requests |
| `loadCssModuleImports` (`vite.js:201`) | `createSyncTokenContractResolver` — synchronous `existsSync`+`readFileSync`+parse instead of `context.resolve`/`context.load` |
| `readCssModuleExports` (`css-module-imports.js:114`) | `readTokenContractModule` — parses the authored module, never runs it, accepts only the literal contract shape; `source.includes('defineThemeTokens')` prefilter mirrors the `.module.` prefilter |
| `resolveCssModuleConstant` (`index.d.ts:102`) | `resolveTokenContract(request, importer)` CompileOptions-style callback, **tri-state**: `facts` / `null` (claimed but unreadable) / `undefined` (not a contract) |
| `textTypeFacts` channel (`index.d.ts:91`) | `compileWithTokenContract` test wrapper: `compile()` + same `parseModule` pass + appended `diagnostics` |

### Observed results (`pnpm vitest run --project octane packages/octane/tests/spike-token-seam/token-seam.test.ts` — 8/8 pass)

- Declared `var(--app-colors-primary)` compiles clean and **emit is
  byte-identical** to a resolver-less compile — diagnostics are additive only.
- `var(--app-colors-primay)` produces exactly one collected diagnostic:
  `{code: 'octane-style-token-undeclared', severity: 'error'}` whose
  `start`/`end` slice to the misspelled name in the source, including inside
  `@media` blocks.
- `var(--legacy-page-gutter)` / `var(--other-x)` stay silent — the legacy
  channel is preserved.
- Resolver returning `null` for the claimed request produces
  `{code: 'octane-style-token-contract-unresolved', severity: 'warning'}` at
  the import specifier — the "unresolved — unverified" fallback, not silence
  and not a crash.
- No resolver configured → no token diagnostics at all (documented silent
  degradation; see "claim boundary" below).
- Identical diagnostics from `compileToVolarMappings().sourceAst` (the editor
  path) — the check is parser-agnostic.
- `tsrx-tsc --noEmit` on a temp consumer project: valid `.tsrx`+`tokens.ts`
  pass clean; `tokens.colors.primay` inside `.tsrx` errors
  (`Bad.tsrx(2,47): error TS2551 … Did you mean 'primary'?`); plain-`.ts`
  contract violations (`vars.colors.primay`, wrong-typed `raw` leaf,
  `variants` key outside the contract) all error.

### Mechanism notes that matter for U10

- CSS declaration values are opaque strings in the style AST
  (`Declaration{property, value, start, end}`); `var(--name)` needs no grammar
  support. Node offsets are **CSS-body-relative**; the body start is
  `sheet.sourceStart` (JS parser) or `styleElement.openingElement.end` (both
  parsers, verified equal = 76 on the fixture). `positionAt`-style offset →
  line/column conversion mirrors `native-change-diagnostics.js:239`.
- The resolver never evaluates application modules — it reads source text and
  parses it, accepting only statically-known literal trees (same discipline as
  `readCssModuleExports`).
- **Claim boundary**: a `var(--x)` reference is checked iff `--x` starts with a
  resolved contract's `namespace` (`--app-` for `prefix: 'app'`). Two corollaries:
  1. A contract with no `prefix` has namespace `--` and claims *every*
     `var(--*)` in the file — enforcement then collapses the legacy carve-out.
     U4/U10 should require a non-empty `prefix` for enforced contracts, or
     document claim-all semantics.
  2. Without a resolver there is no namespace table, so nothing can claim —
     silence under a missing resolver is structural, not a gap. The required
     "unresolved — unverified" warning is the `null` probe: the host resolved
     the request to a contract-shaped module (marker substring, then parse)
     but could not extract facts.
- Upstream quirk observed during the spike: `@tsrx/typescript-plugin`'s
  `tsc.js` drops plain-`.ts` diagnostics from a program whose sibling `.tsrx`
  files error. Repro: `bad.ts`+`tokens.ts`+`Bad.tsrx` reports only the
  `.tsrx` error; removing `Bad.tsrx` surfaces the `.ts` errors. Worth
  recording for U8's editor/CI surface — it can hide `.ts` contract errors
  behind a failing `.tsrx` in the same `tsrx-tsc` run.

## (a) Can dev/HMR afford dependency reads?

**Verdict: yes for this narrow seam — do direct cached file reads in dev/HMR
rather than gating on production.**

Evidence:

- CSS-module constants are production-only (`vite.js:848-849`) for reasons
  that do **not** transfer: they must read the *final transformed* module
  through `context.load({resolveDependencies: false})` (`vite.js:171`), and a
  watch rebuild "does not guarantee that an importer's cached transform
  reruns" (`vite.js:845-847`). A token contract is *authored source* — the
  host can `readFileSync` it directly, exactly like
  `readDescriptorSourceAnalysis` (`vite.js:368-383`) already does in all
  modes, cached in `descriptorSourceCache` and cleared wholesale in
  `watchChange` (`vite.js:881`).
- `textTypes` are production-only (`vite.js:850-851`) because they need a
  TypeScript project (`createTextTypeProject`, `vite.js:713-718`) whose
  invalidation is heavier (`textTypeProject.invalidate`, `vite.js:878`) and
  whose imported-type edits escape the module graph. The token reader is
  orders of magnitude cheaper: substring prefilter + one small-file parse per
  distinct contract module, memoized per resolved path.
- Invalidation story that makes dev reads safe: contract files are real
  imports in Vite's module graph, so an edit invalidates importers naturally;
  add `addWatchFile` (`vite.js:1058` precedent) for belt-and-braces, and clear
  the fact cache in `watchChange` beside `descriptorSourceCache.clear()`.
  Stale-diagnostics window then reduces to "contract edited while importer
  not retransformed", which the module-graph edge already closes.
- Recommendation: **enable in dev/HMR with a per-resolved-file cache cleared
  on `watchChange`**. Production-only gating is unnecessary and would leave
  dev builds — where `dev: true` diagnostics are the DX surface — unverified.

## (b) Can `octane analyze`, MCP `octane_compile`, and tests build a synchronous `.ts` resolver?

**Verdict: yes for analyze and tests; MCP needs one small input addition.**

- `octane analyze` (`packages/cli/src/commands/analyze.js`): already reads
  every target with `readFileSync` using absolute paths (`analyze.js:165`)
  under a known `project.root`, and loads the project's own compiler via
  `createRequire` (`analyze.js:32`). Constructing the spike's
  `createSyncTokenContractResolver` (existsSync + readFileSync + parseModule)
  is a drop-in — it needs nothing beyond the filesystem it already touches.
- Tests: proven directly — the spike resolver is `readFileSync`-backed and
  exercised against real fixture files.
- MCP `octane_compile` (`website-mcp/src/mcp/compile-tool.ts:74-88`):
  `runCompile` receives only `{source, filename, mode, dev, autoMemo,
  parallelUse}` — **no project root**. `filename` is the pasted snippet's
  label, not necessarily a real path on the host. A synchronous resolver is
  constructible *in-process* (the tool is not remote), but it can only resolve
  `./tokens` if `dirname(filename)` is real. Smallest U10 change: add an
  optional `projectRoot` (or absolute `filename` contract) to
  `CompileToolInput`; when present, MCP constructs the same resolver as
  analyze; when absent and the source imports a contract-marked module it
  cannot read, the honest output is the `unresolved — unverified` warning —
  which is exactly why the tri-state (`null` probe) exists. R5 has no
  typecheck fallback, so this warning is the load-bearing behavior, and the
  spike proves the collected-diagnostic channel carries it.

## (c) Consumption syntax: typed `var(--*)` vs a new form

**Verdict: typed `var(--*)` references. Do not add syntax.**

- Declaration values are already raw strings; `var(--name, fallback)` parses
  today inside scoped blocks and `@media` (verified). A new interpolation form
  would require grammar/parser changes in `@tsrx/core` (raw CSS capture,
  `{`-handling), source-map and `cssMappings` work, Volar spans, and the
  prettier path — all to express what CSS already spells.
- Both in-repo precedents converge on `var()`: `createTheme`'s `CSSVarTheme`
  (`packages/styled-components/src/constructors/createTheme.ts`) and the U4
  `defineThemeTokens` WIP (`packages/octane/src/theme-tokens.ts`) emit
  `var(--name, fallback)` leaf strings — so `style={{color: tokens.colors.bg}}`
  and static `<style>` CSS spell the *same* reference the contract declares.
- The enforcement claim rides on the namespace prefix (`--app-`), so raw
  `var(--*)` outside the contract stays legal — the plan's R5 carve-out —
  while a misspelled `--app-*` fails compile.

## Recommended U10 enforcement form

1. `CompileOptions.resolveTokenContract?: (request: string, importer: string) => TokenContractFacts | null | undefined`
   — serializable facts `{namespace, names}`; `null` = claimed-but-unreadable
   → `octane-style-token-contract-unresolved` warning at the import specifier;
   `undefined` = not a contract → silent.
2. Compile-side pass walks `JSXStyleElement → StyleSheet → Declaration`
   values for `var(\s*(--[\w-]+)`; a name under a contract `namespace` must be
   in `names` else `octane-style-token-undeclared` error naming the token and
   listing declared names. Wire it into both `compile()` diagnostics and the
   `compileToVolarMappings` diagnostic channel (KTD3) — the spike proves the
   same walk yields identical results on both ASTs.
3. Contract detection = authored import requests whose resolved module parses
   to a `defineThemeTokens` literal (marker prefilter, then parse). Bundlers
   resolve/load asynchronously before compile (`vite.js:983-991` shape);
   `analyze`/MCP/tests construct the synchronous filesystem resolver.
4. Dev/HMR: enable with a `descriptorSourceCache`-style Map cleared in
   `watchChange` + `addWatchFile` on contract files. Do not gate on
   production.
5. Require a non-empty `prefix` for enforced contracts (or specify claim-all
   semantics for `--`) — U4 API gate.
6. Emit is untouched: facts affect diagnostics only (byte-identical emit
   verified).

## Files in this spike

- `packages/octane/tests/spike-token-seam/_fixture/tokens.ts` — contract module
- `packages/octane/tests/spike-token-seam/_fixture/consumer.tsrx` — `<style>`
  consumer (declared + legacy + nested-`@media` references)
- `packages/octane/tests/spike-token-seam/token-seam.test.ts` — resolver,
  compile-seam prototype, 8 focused tests including a real `tsrx-tsc` run

## Verification

```
pnpm vitest run --project octane packages/octane/tests/spike-token-seam/token-seam.test.ts
# Test Files 1 passed (1)  Tests 8 passed (8)  ~13s
```

No shipped source touched by this spike. Note: the fixture consumes the U4
helper `octane/theme-tokens` (`packages/octane/src/theme-tokens.ts`), which
landed mid-spike in commit `caa5b4b7e feat: add defineThemeTokens typed token
contract` — the spike reads but does not modify it.

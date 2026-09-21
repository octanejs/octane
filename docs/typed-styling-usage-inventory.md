# Typed Native Styling — Repository Usage Inventory and Dispositions

> **Status:** complete for U8 (2026-09). This is the audit record for the
> typed native styling rollout: every `.tsrx` theme/class-map usage in the
> repository, every `var(--*)` consumer, and every style diagnostic the new
> compile gate produced, each with a disposition. See
> `docs/plans/2026-09-20-1623-feat-typed-native-styling-plan.md` (unit U8) for
> the requirement this satisfies.

## 1. Methodology and counting

Every `.tsrx` and Octane-marked `.tsx` file in the repository was compiled
through `packages/octane/src/compiler/compile.js` with the style checks
enabled — the same path `octane analyze` and the Vite/Rspack/Rsbuild plugins
use — and each file was pattern-scanned for usage signals:

- `apply={…}` theme application (`apply`)
- `obj.$class` class-key reads (`$class`)
- `const x = <style>…</style>` assigned style blocks (`assigned-block`)
- `defineThemeTokens(…)` token contracts
- `var(--…)` custom-property reads (`varRefs`)

Counts below distinguish **files** from **usage instances** from
**diagnostics**: a file may hold several style blocks, a block may hold
several `var(--*)` reads, and each diagnostic is one reported finding. Where
the plan estimated "~33 `apply=`/`$class` use sites", that estimate counted
sites loosely; the measured file-level count for theme/class-map operations
is 21 files (individual `apply`/`$class` expressions inside them number
slightly higher and are listed per file below).

### 1.1 Scan totals

| Measure                                  | Count |
| ---------------------------------------- | ----: |
| `.tsrx` / Octane `.tsx` files compiled   | 3,689 |
| Files with any styling signal            |   115 |
| Files with theme/class-map usage         |    21 |
| `var(--*)` reads (files)                 |    94 |
| `defineThemeTokens` call sites (files)   |     4 |
| Token-contract modules (`.ts` fixtures)  |     5 |
| Diagnostics: `octane-css-shorthand-longhand-clash` | 530 at first scan; 3 errors + 424 warnings after the §4.1 precision pass |
| Diagnostics: `octane-css-unused-selector`          |   9 at first scan; 8 after the §4.2 fix |
| Diagnostics: `octane-style-token-undeclared`       |   0 |
| Diagnostics: `octane-style-token-contract-unresolved` | 0 |

Files by area (any styling signal): `website/src` 38, `packages/base-ui` 16,
`packages/shadcn` 15, `playground/octane` 12, `packages/octane` 10 (tests +
fixtures), `packages/octane-evals` 10, `benchmarks/tanstack-com` 7,
`website-mcp` 1, plus single files in `examples/harbor`,
`packages/blocknote`, `packages/input-otp`, `packages/pdf`,
`packages/streamdown`.

## 2. Token contracts

Five authored contract modules exist; all are fixtures or test inputs.
`plain.ts` is intentionally unprefixed (claims no namespace — legal legacy
form); `multi.ts` declares several contracts for resolver coverage;
`broken.ts` is a deliberate non-literal contract that produces
`octane-style-token-contract-unresolved` when claimed.

| File | Disposition |
| ---- | ----------- |
| `packages/octane/tests/_fixtures/token-contract/tokens.ts` | positive fixture (prefixed contract) |
| `packages/octane/tests/_fixtures/token-contract/plain.ts` | positive fixture (unprefixed — legal, claims nothing) |
| `packages/octane/tests/_fixtures/token-contract/multi.ts` | positive fixture (multiple contracts) |
| `packages/octane/tests/_fixtures/token-contract/broken.ts` | intentional negative (unresolvable contract probe) |
| `packages/octane/tests/spike-token-seam/_fixture/tokens.ts` | positive fixture for the seam spike (`--app-*`) |

The only `defineThemeTokens` call sites in compiled source are the eval
task files (`octane.typed-theme-tokens` reference + two `wrong/` variants)
and `spike-token-seam/_fixture/consumer.tsrx`'s import of the contract
above.

### 2.1 Documented carve-outs (not migrated)

| File | Reason |
| ---- | ------ |
| `packages/shadcn/src/styles/theme.css` | Verbatim upstream port of shadcn-ui `globals.css` (`:root`/`.dark` blocks, values unchanged by design). It is a linked `.css` sheet, not an authored `.ts` contract; converting it to `defineThemeTokens` would sever the upstream-port correspondence the file documents. Consumers read its unprefixed vars, which remain legal. |
| `packages/octane/tests/_fixtures/style-map.tsrx` | Exercises the dynamic class-key read `styles[props.kind]` — deliberately untypeable at the compile gate; the typecheck gate types the map shape, not computed key reads. |
| `benchmarks/tanstack-com/**` | Ported third-party markup/CSS; its unprefixed `var(--*)` reads are upstream-derived and stay in the unclaimed legacy path. |

## 3. Theme/class-map usage sites (21 files)

All compiled clean (no diagnostics) unless noted.

### 3.1 Compiler/runtime/browser fixtures — correct as shipped

- `packages/octane/tests/_fixtures/style-theme.tsrx` — theme module
  (`apply`, assigned blocks). **Fine.**
- `packages/octane/tests/_fixtures/style-theme-consumer.tsrx` — imported
  theme, `apply={theme}`, `apply={[a, b]}`, `$class` reads, clsx/spread
  composition. **Fine.**
- `packages/octane/tests/_fixtures/style-order-theme.tsrx` +
  `style-order-applier.tsrx` — cross-module emission-order pair. **Fine.**
- `packages/octane/tests/_fixtures/style-local-assigned.tsrx` — assigned
  blocks inside nested declarations. **Fine.**
- `packages/octane/tests/_fixtures/style-map.tsrx` — class map; computed
  key read is the documented carve-out in §2.1. **Fine (carve-out).**
- `packages/octane/tests/browser/scoped-styles/theme.tsrx` +
  `panel.tsrx` — browser theme/`apply` pair. **Fine.**
- `packages/octane/tests/spike-token-seam/_fixture/consumer.tsrx` —
  imports the `--app-*` contract; all four `var(--app-*)` refs resolve
  and the unprefixed `var(--legacy-page-gutter)` stays legal. **Fine —
  this is the positive enforcement fixture.**

### 3.2 Intentional negative / repro fixtures — stay failing

- `packages/octane/tests/_fixtures/styling-failures/shorthand-longhand-merge-clash.tsrx`
  — seeds `octane-css-shorthand-longhand-clash` (`.card` `border` vs
  `border-top-color`). **Intentional.**
- `packages/octane/tests/_fixtures/styling-failures/stale-scoped-styles.tsrx`
  — seeds `octane-css-unused-selector`. **Intentional.**
- `packages/octane/tests/conformance/_fixtures/fizz-readiness-hydration.tsrx`
  — `.abandoned-late-fallback` is deliberately never rendered (fallback
  abandonment fixture). **Intentional.**
- `packages/octane/tests/_fixtures/token-contract/broken.ts` — see §2.
  **Intentional.**

### 3.3 Eval tasks — intentional by construction

`packages/octane-evals/datasets/train/user-apps-v1/tasks/`:

- `octane.theme-apply/{starter,reference}` — style-map/`$class`/`apply`
  teaching pair; both compile clean. **Fine.**
- `octane.typed-theme-tokens/` — `starter` is the untyped-tokens task
  input; `reference` uses `defineThemeTokens` and compiles clean;
  `wrong/{hand-rolled-tokens,hardcoded-css}` are deliberate bad answers.
  **Intentional (task materials).**
- `octane.repair-shorthand-clash/` — `starter` and
  `wrong/{kept-clash,restated-top-color}` each seed one real same-selector
  clash diagnostic; `wrong/dropped-theme-decl` compiles clean (it fails
  grading, not compilation); `reference` is clean. **Intentional.**
- `octane.repair-stale-selectors/` — `starter` (3 findings) and
  `wrong/left-stale` (1 finding) seed `octane-css-unused-selector`.
  **Intentional.**

### 3.4 Examples and sites

- `examples/harbor/src/islands/PriceBadge.tsrx` — `apply` + assigned
  blocks. **Fine.**
- `website/src/components/CoreApiDemo.tsrx` — `apply`, assigned blocks,
  55 unprefixed `var(--*)` reads (unclaimed → legal). 25 clash findings
  recorded in §4. **Fine; diagnostics recorded.**
- `website-mcp/src/app/Landing.tsrx` — plain scoped block. **Fixed:** the
  `.landing pre code` unused-selector finding was genuine (`<pre>` held
  bare text); markup now nests `<code>`. One disjoint-subject clash
  finding remains, recorded in §4.
- `packages/cli/src/commands/init/templates.js` — starter templates
  **migrated** to `defineThemeTokens`: generated `src/tokens.ts`
  (`prefix: "app"`), components emit `<style>{tokens.css}</style>` and
  scoped CSS reads `var(--app-*)`; importing the contract enables the
  compile gate. Verified by direct compilation of the generated sources.

## 4. Diagnostic findings and dispositions

### 4.1 `octane-css-shorthand-longhand-clash` — 530 → 427 findings

The first scan reported every pair at error severity. A precision pass
split severity by provability and closed two structural gaps:

- **Provable co-match → error; speculative → warning.** Equal or
  subsuming subjects (same selector, `.a` vs `.a:hover`) in the same
  conditional context (`@media`/`@supports`) are errors; distinct class
  combinations that *could* share an element are warnings.
- **Pseudo-element disjointness.** `::view-transition-group(hero)` never
  co-matches `::view-transition-old(.x)` — subjects now record
  pseudo-element identity, so different pseudo boxes (or a pseudo box vs
  a real element) are never compared. This alone removed the 12
  `ViewTransitionsDemo.tsrx` findings and ~70 others.
- **Reset-then-restitute.** When the winning rule redeclares the losing
  longhand after the shorthand (`:hover { background: …;
  background-clip: padding-box; }`), nothing is silently lost — the pair
  is not reported. This removed `HeroDemo.tsrx`'s scrollbar finding and
  the remaining reset-pattern noise.

Final state: **3 errors** (all intentional negatives — the two
`octane.repair-shorthand-clash` task fixtures and the
`styling-failures` ledger fixture) and **424 warnings** (speculative
pairs that could co-match on markup carrying both classes).

Real-source errors found and dispositioned in `website/src/pages/doc-page/DocPage.tsrx`:

- 6 × `text-decoration` shorthand shadowing `text-decoration-color` on
  card/pagination links — converted `text-decoration: none` to the
  longhand `text-decoration-line: none` (the check's suggested remedy;
  rendered output unchanged).
- 2 × `padding` shorthand shadowing base-list `padding-left` on
  `.api-index-card`/`.doc-card` `ul`/`li` — deliberate resets, suppressed
  per-rule with `/* octane-ignore octane-css-shorthand-longhand-clash */`.

**Disposition of remaining warnings:** recorded analyzer-precision
limitation, not a compiler bug. The check deliberately over-approximates
co-matchability because it cannot prove disjointness across an entire
template; silencing a site with
`/* octane-ignore octane-css-shorthand-longhand-clash */` is the
documented escape hatch. Warnings do not fail builds — only error
severity promotes per KTD3.

### 4.2 `octane-css-unused-selector` — 9 findings (8 after fix)

- **6 intentional negatives** — §3.2–3.3 fixtures (stale-selector eval
  starter ×3, `wrong/left-stale` ×1, `stale-scoped-styles.tsrx` ×1,
  `fizz-readiness-hydration.tsrx` ×1).
- **1 genuine, fixed** — `website-mcp/src/app/Landing.tsrx`
  `.landing pre code` (markup lacked the `<code>` child; added).
- **2 false positives** — `website/src/pages/playground/Playground.tsrx`
  `.pg-panel + .pg-panel` (base + media-query copy). The markup provably
  renders adjacent `.pg-panel` sections, but both carry the class through
  a dynamic array `class={['pg-panel', cond && 'mobile-hidden']}`, which
  the sibling-adjacency proof does not model. Recorded limitation;
  selectors are live.

### 4.3 Token and class-key gates — 0 findings

No `octane-style-token-undeclared`, `octane-style-token-contract-unresolved`,
or `octane-style-unknown-class-key` findings on production source. The
only claimed namespace is the spike fixture's `--app-*`, whose four
references all resolve. All 94 `var(--*)` files read unclaimed (unprefixed
or undeclared-elsewhere) names — legal legacy behavior the contract
system explicitly preserves.

## 5. What changed under this audit

- `packages/cli/src/commands/init/templates.js` — starter templates emit
  `src/tokens.ts` via `defineThemeTokens` and consume `--app-*` refs.
- `packages/cli/src/commands/init/index.js` — scaffolds `src/tokens.ts`.
- `packages/cli/tests/{create,init}.test.js` — assert the generated
  contract module, `<style>{tokens.css}</style>`, and `--app-accent`.
- `website-mcp/src/app/Landing.tsrx` — `<pre>` gains a `<code>` child
  (fixes the genuine stale-selector finding).
- `website/src/pages/doc-page/DocPage.tsrx` — 3 × `text-decoration:
  none` → `text-decoration-line: none`; 2 × `octane-ignore` on
  deliberate list-padding resets (§4.1).
- Teaching surfaces updated to shipped syntax:
  `.rulesync/rules/tsrx-authoring.md` (+ `pnpm rules:generate` outputs),
  `website/public/llms.txt`, the four styling-relevant MCP skills under
  `packages/octane-mcp-server/skills/`, and
  `website/src/content/docs/styling.mdx`.

`git diff origin/main -- packages/stylex` remains empty; StyleX is
untouched by design.

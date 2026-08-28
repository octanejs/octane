# Agent Context Engineering Plan

Retargeting Octane's agent-facing context for Claude 5-generation models.

Source: Thariq (@trq212), 2026-07-24: ["The new rules of context engineering
for Claude 5 generation models"](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models).
Anthropic removed ~80% of the Claude Code system prompt for Opus 5 / Fable 5
with no measurable regression on coding evals.

## Status

Landed on `agent-context-engineering`:

| Change | Effect |
| --- | --- |
| `fix(lexical)` | Removed a published `declare module '*.tsrx'` that made consumers' own `.tsrx` imports `any`. One deleted file plus switching that package's typecheck to `tsrx-tsc`, instead of 32 hand-maintained sidecars |
| `ci: tsrx-decls:check` | The rule now has a gate, scoped to published `packages/*/src` |
| `docs(rules)`: divergence pointer | Divergence lookups go to the 333-line contract, not the 863-line migration plan |
| `docs(rules)`: root rule shrink | **341 → 106 lines, ~5.0k → ~1.3k tokens.** Divergences promoted to the top; repo map deleted; `.tsrx` reference and test layout moved to path-scoped topic rules |
| `refactor(rules)`: skills | The 7 maintainer procedures moved from `.ai/skills` (unreachable) into `.rulesync/skills`, which generates `.claude/skills/`, `.github/skills/`, `.cursor/skills/`, `.gemini/skills/`. `.ai/project-map.md` deleted as a drifted duplicate; `octane_project_map` now returns the generated `AGENTS.md` |

Two findings below were wrong when first written, and are corrected in place:

1. **`.claude/rules/` is not dead.** RuleSync emits Claude Code `paths:`
   frontmatter, so those rules already load only when Claude opens a matching
   file. It was the best-configured part of the setup, and it became the
   mechanism the trim used.
2. **Copilot is not root-only.** RuleSync emits
   `.github/instructions/*.instructions.md` with `applyTo` globs. Every target
   gets path-scoped topic rules, so moving content out of the root costs no
   agent anything.

Both corrections pointed the same way: shrink the shared root rule and push
topics into glob-scoped rules, rather than forking a Claude-only root.

---

## 1. What the post actually claims

Six shifts:

| # | From | To |
| --- | --- | --- |
| 1 | Explicit rules | Judgment. *"default to no comments, never write multi-paragraph docstrings"* → *"write code that reads like the surrounding code: match its comment density, naming, and idiom."* |
| 2 | Examples in the prompt | Expressive tool interfaces. An enum of `pending \| in_progress \| completed` teaches usage better than a worked example. |
| 3 | Upfront context | Progressive disclosure. Detailed procedures move into skills; tool schemas load on demand; CLAUDE.md and SKILL.md become trees that load contextually. |
| 4 | Repetition | One home per instruction. Tool-usage guidance lives in the tool description, nowhere else. |
| 5 | Manual `#` memory in CLAUDE.md | Auto-memory. |
| 6 | Markdown specs | Rich references: code-based specs, HTML artifacts, executable test suites, rubrics for verifier agents. |

The operative test, stated in the post: **for each explicit rule, ask whether
Claude would get it right by reading the surrounding code and understanding the
user's intent. If yes, delete the rule.**

`/doctor` in Claude Code automates part of this.

### What the post does *not* claim

The 80% is a *result*, not a *target*. It came from deleting behavioral
guardrails written for weaker models in a **product** system prompt that ships
to every repository on earth. Those guardrails were compensating for model
deficits that no longer exist.

Octane's CLAUDE.md is a different animal: most of it is **domain knowledge about
a language and a runtime that do not exist in the model's priors**, and, worse, that sit adjacent to an extremely strong *conflicting* prior (React).
Deleting knowledge is not unhobbling; it is lobotomy.

So: **adopt the test, reject the percentage.** The rest of this document applies
the test rule-by-rule.

---

## 2. Self-assessment: the surface as it stands

Measured 2026-07-25 on `main` @ `defdd0fc`.

### 2.1 Inventory

| Surface | Size | Loaded when | Verdict |
| --- | --- | --- | --- |
| `CLAUDE.md` | 341 lines / 19,922 B / **~5.0k tok** | **every session, always** | Oversized; wrong content prioritized |
| `~/.claude/CLAUDE.md` | 29 lines / ~0.4k tok | every session, always | Fine |
| `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules/project.mdc` | 1,397 lines combined | per-host | Generated; `copilot-instructions.md` is **byte-identical** to `CLAUDE.md` |
| `.rulesync/rules/core-engineering.md` | 120 lines | never auto-loaded | Referenced by path from CLAUDE.md |
| `.rulesync/rules/testing.md` | 87 lines | never auto-loaded | Not referenced from CLAUDE.md at all |
| `.claude/rules/{core-engineering,testing}.md` | 207 lines | **only when Claude reads a matching file** | **Correct already.** RuleSync translates `globs` into Claude Code `paths:` frontmatter |
| `.cursor/rules/*.mdc`, `.gemini/memories/*`, `.agents/memories/*` | 6 more copies | per-host | Generated |
| `.ai/project-map.md` | 65 lines | **never: unreachable** | Hand-maintained 6th restatement; drifted |
| `.ai/skills/*.md` (7) | 490 lines | **never: unreachable** | Not `.claude/skills/`; no frontmatter; not referenced from CLAUDE.md |
| `.claude/README.md` | 21 lines | never (Claude Code does not auto-read it) | Routes to `.ai/skills/`; the route is dead |
| `.claude/skills/`, `.claude/commands/`, tracked `.claude/settings.json` | **absent** | n/a | No repo skills, no slash commands, no shared hooks/permissions |
| `packages/octane-mcp-server/skills/*.md` (5) | 537 lines | on demand via `octane_skill` | **Good.** Single source; `website-mcp` inlines them at build time |
| MCP tools (stdio + hosted) | ~11 tools | on demand | Good mechanism, divergent naming |
| `docs/*.md` (46 files) | **19,120 lines** | on demand, by path | No index, no durable/historical split |
| `@octanejs/evals` | 19 graded tasks | n/a | **App-authoring only**; zero maintainer coverage |
| `~/.claude/agents/principal-engineer.md` + 11 global skills | 184 + ~640 lines | on demand | Well-formed; overlaps repo rules |

### 2.2 Finding A, the same engineering standard is written **nine** times

`core-engineering.md`'s gates (contract-first, hot-path analysis, baseline
before optimizing, adversarial self-review of the final diff, evidence at
handoff) are restated, in substantially the same words, in:

1. `.rulesync/rules/core-engineering.md` (source)
2. `.claude/rules/core-engineering.md` (generated, path-scoped)
3. `.cursor/rules/core-engineering.mdc` (generated)
4. `.gemini/memories/core-engineering.md` (generated)
5. `.agents/memories/core-engineering.md` (generated)
6. `CLAUDE.md` § *Framework-Fundamental Changes* (pointer + summary)
7. `.ai/skills/octane-core-extend.md` § *Adversarial self-review*
8. `.ai/skills/performance-audit.md`
9. `packages/octane-mcp-server/skills/build-octane-software.md`
10. `octane-mcp-server/src/index.js` → `instructionsFor()`: injected into MCP
    initialization for every connected agent
11. `~/.claude/agents/principal-engineer.md` and `~/.claude/skills/perf-audit`,
    `deep-review`, `land`

Bodies 1-5 are byte-identical modulo frontmatter (verified: `diff` ≤ 2 lines).

This is exactly shift #4, at scale. And it is the *one* category the post's
deletion argument applies to cleanly: **Opus 5 does not need to be told to run
the tests, read the callers, and not claim a speedup without a measurement, ten times over.**

### 2.3 Finding B, the repo's own skills are invisible to Claude Code

- `.ai/skills/` are plain markdown with no frontmatter. Claude Code's skill
  mechanism requires `.claude/skills/<name>/SKILL.md` with `name` +
  `description`. There is no `.claude/skills/` directory.
- `CLAUDE.md` never mentions `.ai/`. The only pointer is `.claude/README.md`,
  which Claude Code does not auto-read.
- They are therefore reachable **only** through the stdio MCP server's
  `octane_skill` in repo mode.

Meanwhile the *user-facing* skills (`packages/octane-mcp-server/skills/`) are
architected correctly: one source, inlined by `website-mcp` at build time,
served by both transports. The maintainer path is the one that rotted.

Net: 490 lines of carefully written maintainer procedure that a default
`claude` session in this repo will never see, while 341 lines of general
overview load unconditionally. That is progressive disclosure inverted.

### 2.4 Finding C: CLAUDE.md's priority order is inverted against cost

| Section | Lines | Can Claude infer it from the code? | Always-load justified? |
| --- | --- | --- | --- |
| Start From Current Sources | 10-34 | partly (`ls`) | trim to a pointer |
| RuleSync | 35-54 | no, but it is a **trigger**, not knowledge | no: belongs in a gate |
| Repo Map | 55-104 | **yes**: `ls packages/` + generated `docs/packages.md` | **no** |
| Authoring `.tsrx` | 105-136 | mostly, by reading a `.tsrx` file | compress + skill |
| Types for `.tsrx`/`.tsx` | 137-161 | **no**, the correct move is anti-idiomatic | **yes**, 3 lines |
| **Intentional Divergences** | **162-235** | **no, the prior is actively wrong** | **yes**, this is the whole point |
| Validation | 236-301 | yes (`package.json` scripts) + CI-gated | no |
| Framework-Fundamental Changes | 302-311 | yes for Opus 5 | pointer only |
| Compiler AST Immutability | 312-320 | no, but **machine-enforced** already | no |
| Changesets | 321-330 | no, but **CI-gated** | no |
| Practical Guidance | 331-341 | yes | **delete** |

The single highest-value block, the intentional divergences, the only content
where the model's default behavior is *confidently wrong*: is 74 lines buried
at position 6 of 11, surrounded by ~180 lines of material that is inferable,
generated, or already gated.

### 2.5 Finding D, the Repo Map has already drifted

`CLAUDE.md:78-84` hardcodes a 31-package binding list. The workspace has **58**
packages. Missing from the list: `aria`, `dexie`, `styled-components`,
`tanstack-hotkeys`, `tanstack-pacer`, `tanstack-router-ssr-query`, `query`,
`router`, `react-compat`, `react-wrapper`, `devtools`, `lynx`, and more.

Meanwhile `docs/packages.md` is **generated and CI-gated**
(`pnpm packages:inventory:check`). The always-loaded copy is the stale one; the
verified copy is the one nobody loads. Hand-maintained inventory inside an
always-on prompt is a rot generator with a per-session token bill.

### 2.6 Finding E: prose rules decay; gated rules do not. We have proof in-tree.

CI already hard-gates ~15 rules that `CLAUDE.md` *also* states in prose:

| Prose rule in CLAUDE.md | Gate |
| --- | --- |
| "do not use `skip`, `todo`, or expected-failure modifiers" | `pnpm test:markers:check` |
| "`docs/parity-gaps.md` should remain at zero" | `pnpm parity:gaps:check` |
| "regenerate after changing RuleSync content" | `pnpm rules:check` + `git diff --exit-code` |
| "stay on the `patch` track" | `pnpm changeset:check` |
| "`pnpm bindings:status` to regenerate after a scope change" | `pnpm bindings:status:check` |
| "regenerate the evals corpus in the same commit" | corpus freshness tests |
| "never mutate a parsed AST" | `OCTANE_COMPILE_FROZEN_AST` deep-freeze: **throws at the offending line** |
| "run `pnpm format:check` before handoff" | CI `format:check` |
| slot-keyed hook in a plain JS loop | **compile error** |
| React-style `onChange` on a text host | `OCTANE_NATIVE_TEXT_ONCHANGE` diagnostic |

Now the control case. Exactly one hard prohibition in `CLAUDE.md` has **no**
gate:

> Never write `declare module '*.tsrx';` … That shim erases every export's type
> and hides real errors, the repo spent a full campaign deleting them.

It is currently violated in two files:

- `packages/lexical/src/tsrx-modules.d.ts:4`: **published binding source**;
  this is the exact documented harm, shipped.
- `packages/octane/tests/tsrx.d.ts:5`: test-scoped, lower harm.

And three sibling packages (`tanstack-query`, `tanstack-hotkeys`,
`tanstack-pacer`) carry comments explaining that they deliberately avoided the
wildcard. So the convention is real, understood, unenforced, and it drifted
back anyway, despite a prose rule *claiming a campaign had eliminated it*.

**Conclusion: in this repo, gated rules hold and prose rules decay.** That is
the strongest available argument for moving rules out of the prompt, not to
save tokens, but because prose is not an enforcement mechanism.

### 2.7 Finding F: progressive disclosure points at the wrong document

`CLAUDE.md:32-34` sends the agent to `docs/react-parity-migration-plan.md`
(**863 lines, ~73 KB**) before "fixing" a divergence. That document is a
*migration plan*: tiered test-migration strategy, historical analysis.

The durable contract is `docs/differences-from-react.md` (333 lines), which
opens with "The differences below are **deliberate**".

Corroboration: `website-mcp` curates exactly **3** of the 46 repo docs into its
agent-facing corpus: `ssr.md`, `differences-from-react.md`,
`deferred-hydration.md`. The repo already knows which docs are durable
contracts. That knowledge lives in a Vite import list and nowhere else.

`docs/` has 19,120 lines, 46 files, no `README.md`, no index, no frontmatter,
and no durable-vs-historical separation. An agent told to "read the docs"
cannot budget that.

### 2.8 Finding G: no measurement for the thing we are about to change

`@octanejs/evals` has 19 executable tasks with real graders. Its README is
explicit: *"none asks it to repair or modify the Octane monorepo."*

So the evals validate the **user-facing** surface (MCP skills, README, public
docs) and provide **zero** signal on the **maintainer** surface (CLAUDE.md,
`.rulesync`, `.ai/skills`), which is precisely what this plan proposes to cut.

Anthropic cut 80% *and measured no regression on coding evals.* Cutting blind
here would violate this repository's own standard:

> Never claim a performance improvement without measurements. If representative
> measurement is impractical, say so, avoid the claim, and document the
> remaining performance risk.: `core-engineering.md:50`

That standard applies to context engineering too. **Phase 0 is instrumentation,
and it is a gate, not a nice-to-have.**

---

## 3. The framing that should drive the changes

### 3.1 Triage every rule into one of four buckets

The post's test ("would Claude get it right anyway?") is necessary but not
sufficient here, because it has only two outcomes. Octane needs four:

| Bucket | Test | Action |
| --- | --- | --- |
| **J: Judgment** | Opus 5 gets it right by reading surrounding code and intent | **Delete.** |
| **K: Knowledge (anti-prior)** | The model's confident default is *wrong*; no amount of local reading corrects it, because the surrounding code looks like React | **Keep, but right-size and rank.** |
| **M: Machine-enforceable** | A compiler diagnostic, type, lint, test, hook, or CI gate can catch the violation at the moment it happens | **Promote to machinery, delete the prose.** |
| **P: Procedure** | A multi-step workflow needed only for a specific task class | **Demote to a skill (progressive disclosure).** |

Applying this: of `CLAUDE.md`'s 341 lines, roughly **J ≈ 25%, K ≈ 20%,
M ≈ 30%, P ≈ 25%**. Only bucket K stays resident. The 80%-out figure is
reachable, but through three different mechanisms, not one delete key.

### 3.2 The compiler-first multiplier

Octane has a lever most repos lack: **it owns a compiler, a type layer, a test
harness, and 15 CI gates.** Every rule that can be moved from prose into that
machinery gets three wins at once:

1. It leaves the always-on context budget.
2. It is enforced deterministically instead of probabilistically.
3. It teaches **at failure time**, when the agent is holding the offending code
   and can act, which is strictly better pedagogy than a paragraph read 200k
   tokens earlier.

This is shift #2 ("from examples to interface design") generalized: **the best
place to encode a rule is the interface that makes violating it fail.**

The `declare module '*.tsrx'` regression (§2.6) is the empirical proof that this
is not theoretical.

### 3.3 Path-scoped rules first, skills second

Claude Code offers two ways to keep content out of the always-loaded budget, and
they are not interchangeable:

- **`.claude/rules/*.md` with `paths:` frontmatter** load automatically when
  Claude reads a matching file. No decision required from the model.
- **`.claude/skills/*/SKILL.md`** load when the model judges them relevant, or
  when a user invokes them.

Rules are strictly more reliable, because nothing depends on the model choosing
correctly. So the rule is: **if the content is tied to a path, it belongs in a
path-scoped rule; only genuinely task-scoped procedures become skills.**

That maps cleanly onto what has to leave CLAUDE.md:

| Content | Tied to | Destination |
| --- | --- | --- |
| `.tsrx` authoring syntax | `**/*.tsrx` | new path-scoped rule |
| Compiler AST immutability | `packages/octane/src/compiler/**` | fold into `core-engineering.md` |
| Test-suite layout and harnesses | `**/tests/**` | fold into `testing.md` |
| Port a React library / handle an issue / triage | nothing: a task | skill |

RuleSync already owns this. Adding a rule file with `globs` gets the Claude Code
`paths:` output, the Cursor `globs` output, and the rest, for free.

### 3.4 The one place to resist the article

Do **not** compress the intentional divergences on the theory that Claude 5
"has good judgment." Judgment is a function of priors, and here the prior is
adversarial: every model has seen millions of lines of React and near-zero
`.tsrx`. A model exercising *excellent* React judgment on Octane code will:

- add a synthetic `onChange` normalization,
- "fix" `class` array composition to React's `"a,b"` coercion,
- rewrite an LIS reconciler toward `lastPlacedIndex`,
- add a dependency array to a hook the compiler infers,
- hoist a conditional hook to satisfy rules-of-hooks,
- serialize a parallel `use()` into a waterfall,
- reach for `forwardRef`.

Each of those is a *plausible, competent, wrong* change. That is the signature
of an anti-prior, and anti-priors are the one thing that must stay resident.
They should get **more** prominence after this work, not less, as the first
section, tightened, not the sixth section, buried.

---

## 4. The plan

Seven phases. Phase 0 gates everything that follows. Phases 1-2 are independent
of 3-6 and can land first.

---

### Phase 0: Instrumentation (blocking gate)

**Why first:** §2.7. Without it, every later claim is an assertion.

**0.1: Add a maintainer eval family to `@octanejs/evals`.**

New dataset `datasets/train/maintainer-v1`, ~12-15 tasks that operate on a
scratch copy of the monorepo rather than a starter app. Each task: a realistic
maintainer request + an executable grader. Coverage must target the anti-priors
and the gate-triggers, because those are the failure modes context is buying:

| Task class | Grader asserts |
| --- | --- |
| Add a runtime behavior behind a divergence | did not "fix" toward React; divergence test still passes |
| Port a React conformance test | cites source line; no `skip`/`todo`; `test:markers:check` clean |
| Compiler transform change | no in-place AST mutation (frozen-AST run passes); no string-assembled JS |
| Add a binding package | `status.json` present; `bindings:status:check` clean; changeset present and `patch` |
| Perf-sensitive runtime edit | baseline captured before edit; benchmark ratio gate run |
| Author a `.tsrx` fixture | correct `@{}` / `@for … key` / `{expr as string}`; no `declare module '*.tsrx'` |
| Touch `.rulesync` | ran `rules:generate`; `rules:check` clean |
| Dependency bump | evals corpus regenerated in the same commit |

Graders are **executable**, they run the real gates. This is shift #6 (rich
references): the eval *is* the spec.

**0.2: Add a context-ablation runner.**

`packages/octane-evals/scripts/ablate-context.mjs`: runs a dataset under N
context configurations and emits a comparison table.

Configurations at minimum:

- `full`: today's `CLAUDE.md` (baseline)
- `proposed`, the Phase-2 rewrite
- `proposed+skills`: Phase-2 + Phase-3 `.claude/skills/`
- `minimal`: repo description only (the floor; establishes how much the
  context is worth at all)
- `none`: no `CLAUDE.md` (the true control)

Report per-task pass/fail, tokens of resident context, and total tokens spent.

**Success criterion for the whole plan:** `proposed+skills` ≥ `full` on pass
rate, at ≤ 40% of resident context tokens. If pass rate drops, the deleted
content was bucket K, not J: restore it and re-triage. Record the numbers in
the plan doc.

**Risk:** eval noise. Mitigate with ≥3 runs per configuration and reporting
per-task variance, not just aggregate pass rate. Do not read a 1-task delta as
signal.

---

### Phase 1: Delete what is dead or duplicated

Independent of Phase 0. No behavior claim, so no measurement needed: these are
either unreachable or byte-identical.

**1.1: Keep `.claude/rules/`; use it more.** RuleSync already turns each rule's
`globs` into Claude Code `paths:` frontmatter, so `core-engineering.md` loads
only when Claude reads `packages/octane/src/**` and `testing.md` only when it
reads a test file. This is the mechanism the rest of the plan wants, already
working. Phase 2 should move CLAUDE.md content *into* new path-scoped rules
rather than into skills wherever the content is tied to a path.

**1.2: Delete `.ai/project-map.md`.** A 6th restatement, unreachable, and
already drifted ("private pnpm monorepo"; lists `adapter-vercel`, omits
`adapter-cloudflare`). Its only consumer is the MCP `octane_project_map` tool: repoint that at `docs/packages.md` (generated, CI-gated) plus the trimmed
`CLAUDE.md`.

**1.3: Delete `.claude/README.md`.** It routes to `.ai/skills/`, a route that
does not exist for Claude Code. Phase 3 replaces it with real skills, whose
`description` frontmatter *is* the routing table.

**1.4: Collapse the engineering-standard restatements to one source.**
`core-engineering.md` stays the single normative text. Everything else
references it by path or, better, ceases to restate it:

- `.ai/skills/octane-core-extend.md`: drop its self-review/handoff paragraphs
  (Phase 3 rewrites this file anyway).
- `octane-mcp-server/src/index.js` `instructionsFor()`: cut to one sentence.
  See Phase 6.
- Consider whether `~/.claude/agents/principal-engineer.md` and the global
  `perf-audit` / `deep-review` / `land` skills should defer to the repo's
  standard when inside this repo, rather than assert a parallel one. (User-level
  change; out of repo scope but worth aligning.)

**1.5: Audit the remaining generated targets.** `copilot-instructions.md` is
byte-identical to `CLAUDE.md`; that is fine and intended. Just confirm each
target still has a live consumer: `.gemini/`, `.agents/`, `.codex/` cost
nothing at runtime but they do cost review attention on every rules change.

**Verification:** `pnpm rules:check`, `pnpm format:check`, `git diff` on
generated targets, and a `grep` proving no source references the deleted paths.

---

### Phase 2: Rewrite `CLAUDE.md` around anti-priors

Target: **341 → ~90 lines (~1.3k tok)**, a ~73% cut, with the divergences
*expanded in prominence* and everything else demoted.

Proposed skeleton:

```markdown
# Octane

Compiler-first UI framework with React's programming model. Components are
authored in `.tsrx` and compiled ahead of time. Alpha: APIs can still change.

Read `packages/octane/src/runtime.ts` for runtime behavior: its comments are
the design spec. `docs/differences-from-react.md` is the divergence contract.

## Octane is React-shaped but deliberately not React

Your React instincts will produce plausible, competent, wrong changes here.
Before "fixing" any of these toward React, read `docs/differences-from-react.md`:

- Hooks are call-site-slot keyed → conditional hooks and post-early-return hooks
  are valid. A slot-keyed hook in a plain JS loop is a compile error.
- Omitted dependency arrays are compiler-inferred, not a bug.
- `useState`/`useReducer` return a third member: a current-state getter.
- Events are native and delegated. There is no synthetic `onChange`; `onInput`
  is the per-keystroke handler. Do not add a synthetic layer.
- The keyed reconciler is LIS-based, not `lastPlacedIndex`. Final DOM and
  survivor identity are guaranteed; the move set is not.
- `use()` runs in parallel by design: no suspense waterfalls. Do not "fix"
  fetch-start timing toward React.
- `class`/`className` compose clsx-style: an array yields `"a b"`, not `"a,b"`.
- Refs are props (`ref={cb|obj|[a,b]}`). No `forwardRef`.
- No class components, no Server Components, no StrictMode double-invoke.
- First root mount is synchronous; `root.render(App, props)` is supported.

## Types

Never write `declare module '*.tsrx'`, it erases every export's type. `.tsrx`
type-checks through `tsrx-tsc`; use `tsrx-tsc --noEmit`, never plain `tsc`.
Octane-owned `.tsx` carries a leading `/** @jsxImportSource octane */` pragma.
Use `OctaneNode`, never `React.ReactNode`.

## Authoring `.tsrx`

Read a nearby `.tsrx` file. The non-obvious parts: `@{ … }` is
return-JSX shorthand and must end with exactly one output node; dynamic text
needs `{expr as string}` unless provably a string; control flow is `@if`/`@for
(…; key x.id)`/`@switch`/`@try` directive blocks. Full syntax:
`.claude/skills/authoring-tsrx/`.

## Working here

`pnpm test`, `pnpm typecheck`, `pnpm format:check`. Run `format:check`
repo-wide, not on touched files: generated baselines and docs share the gate.

RuleSync owns the generated agent files: edit `.rulesync/rules/`, then
`pnpm rules:generate`.

Framework-fundamental work (runtime, compiler, scheduler, reconciler,
SSR/hydration) follows `.rulesync/rules/core-engineering.md`.
```

**What is deleted and why:**

| Deleted | Bucket | Rationale |
| --- | --- | --- |
| Repo Map package inventory (50 lines) | J + drifted | `ls packages/`; `docs/packages.md` is generated + gated (§2.5) |
| Validation command catalog (66 → 4 lines) | J | `package.json` scripts are self-describing; the gates are in CI |
| Compiler AST Immutability (9 lines) | M | `OCTANE_COMPILE_FROZEN_AST` throws at the offending line |
| Changesets (10 lines) | M | `changeset:check` gates it; see Phase 4.4 |
| Test-suite structure (30 lines) | P | → `.claude/skills/octane-testing/` |
| Practical Guidance (11 lines) | J | Pure "be a good engineer", the canonical bucket-J delete |
| Long-form divergence prose (74 → 20 lines) | K, compressed | Keep every *item*; cut the explanation to a pointer. The item is the anti-prior signal; the paragraph is elaboration that `differences-from-react.md` already carries |

**What is added:** an explicit statement that React instincts are the failure
mode. Naming the trap is higher-leverage than any single rule under it.

**Risk:** compressing divergence prose could lose a nuance that only the long
form carried (e.g. the `suppressNativeChangeWarning` escape hatch). Mitigation:
Phase 0's eval family targets exactly these; and every compressed item must have
a corresponding section in `docs/differences-from-react.md`. **Add a CI check
that every bullet in the CLAUDE.md divergence list resolves to a heading in
`differences-from-react.md`**: otherwise compression silently drops contracts.

---

### Phase 3: Real skills, real progressive disclosure

**3.1: Create `.claude/skills/` from `.ai/skills/`.** Convert each of the 7
maintainer procedures into `.claude/skills/<name>/SKILL.md` with proper
frontmatter. The `description` field is what the model routes on, so it must
state the trigger, not the topic:

```yaml
---
name: octane-core-extend
description: Change Octane's runtime, compiler, scheduler, reconciler, or
  SSR/hydration engine. Use when editing packages/octane/src/**: establishes
  the observable contract, hot-path analysis, and the performance-evidence
  gates required before handoff.
---
```

Mapping (rename for trigger clarity):

| `.ai/skills/` | `.claude/skills/` | Notes |
| --- | --- | --- |
| `octane-core-extend.md` | `octane-core-extend/` | Strip the restated self-review prose (§1.4); reference `core-engineering.md` |
| `performance-audit.md` | *drop* | Global `perf-audit` skill covers it; keep only Octane-specific benchmark routing, fold into `octane-core-extend` |
| legacy React-library port skill | `octane-react-library-port/` | Complements the global `port-parity` skill |
| `bug-hunter.md` | *drop* | Global `root-cause` covers it |
| `triage.md` | `octane-triage/` | Keep: repo-specific area routing |
| `create-a-pr.md` | *drop* | Global `land` + user's global CLAUDE.md cover it |
| `handle-issue.md` | `octane-handle-issue/` | Keep: `gh` + repo triage specifics |
| n/a | `authoring-tsrx/` | **New.** The full `.tsrx` syntax reference lifted out of CLAUDE.md |
| n/a | `octane-testing/` | **New.** Test-suite layout, harnesses, conformance/differential/hydration policy, from CLAUDE.md § Validation + `testing.md` |

Dropping four skills is deliberate: they duplicate the global suite, and shift
#4 says one instruction gets one home. Repo skills should carry only what is
*Octane-specific*.

**3.2: Multi-file skills where they exceed ~80 lines.** The post is explicit
about splitting long skills into trees. `octane-core-extend` should be
`SKILL.md` (routing + gates) plus `reference/compiler.md`,
`reference/runtime.md`, `reference/ssr.md`: loaded only when the change
touches that area.

**3.3: Slash commands for the repeated multi-step chores.** `.claude/commands/`
for things currently expressed as prose the agent must remember to do:
`/octane-validate <paths>` (the right subset of gates for a path set),
`/octane-port-react-test <upstream-file>`, `/octane-bench <suite>`.

**3.4: Shared `.claude/settings.json`** (currently only an untracked
`settings.local.json`): commit a shared allowlist for the read-only repo
commands every agent runs (`pnpm test`, `pnpm typecheck`, `pnpm format:check`,
`git log/diff/show`, the `:check` scripts). Removes a permission prompt per
session per maintainer, and is the hook host for Phase 4.

---

### Phase 4: Promote un-gated rules to machinery

The highest-value phase. Each item removes prose *and* closes a real hole.

**4.1: Ban wildcard `declare module '*.tsrx'`.** The §2.6 control case.

- Add `scripts/check-tsrx-module-decls.mjs` + `pnpm tsrx-decls:check`, wired
  into `ci.yml` beside the other `:check` gates.
- Fix the two live violations. `packages/lexical/src/tsrx-modules.d.ts` needs
  per-module `.d.ts` sidecars matching the pattern already documented in
  `tanstack-query`/`tanstack-hotkeys`/`tanstack-pacer`.
- `packages/octane/tests/tsrx.d.ts` is test-scoped; either an explicit
  allowlist entry with a comment, or convert it too. Prefer converting: an allowlist is where bans go to die.
- Error message carries the *why* and the fix, so the agent learns at failure
  time.

**4.2: A `.tsrx` authoring lint for the divergence traps.** Extend the existing
diagnostic surface (`OCTANE_NATIVE_TEXT_ONCHANGE` is the model) to cover the
other high-frequency anti-prior errors:

- `forwardRef` imported from `octane` → error with the ref-as-prop fix.
- `React.ReactNode` in an Octane-owned file → error pointing at `OctaneNode`.
- Explicit dependency array that exactly equals what the compiler would infer →
  *info*-level hint, not an error (this one is legal and sometimes intentional).

Each diagnostic added here is a line that can leave `CLAUDE.md` permanently.

**4.3: A `PreToolUse`/`PostToolUse` hook for the regeneration triggers.**
`.claude/settings.json` hook on `Edit|Write` matching `.rulesync/**` →
non-blocking reminder to run `pnpm rules:generate`; matching `pnpm-lock.yaml` →
reminder for `corpus:generate`. These are pure *triggers* (bucket P/M), and a
hook fires them at the right moment instead of asking the model to hold them in
context for the whole session.

**4.4: Keep the CI gates, delete their prose.** For every rule in the §2.6
table, remove the CLAUDE.md sentence and make sure the *gate's failure message*
carries the guidance. Check each `scripts/*.mjs --check` failure path: does it
tell the agent what to run? If not, fix the message. **The error message is the
new documentation.** This is shift #2 applied to CI.

**Verification for Phase 4:** each new gate must fail on a deliberately broken
tree and pass on `main`, the same standard `testing.md` demands of regression
tests.

---

### Phase 5: Rich references

**5.1: Split `docs/`.** 46 files, 19,120 lines, no index.

- `docs/`: durable contracts only. Seed from what `website-mcp` already
  curates: `differences-from-react.md`, `ssr.md`, `deferred-hydration.md`, plus
  `packages.md`, `bindings-status.md`, `parity-gaps.md`, `devtools.md`,
  `decallback-memo.md`.
- `docs/plans/`, the historical agent-authored implementation plans. These are
  local working artifacts and remain ignored; use issue and pull-request history
  when archaeological context is needed.
- `docs/README.md`: a real index: one line per durable doc, stating **when to
  read it**, not what it contains.

**5.2: Repoint CLAUDE.md's divergence reference** from
`react-parity-migration-plan.md` (863 lines, historical) to
`differences-from-react.md` (333 lines, contract). §2.7. This one line is
probably the single cheapest win in the document.

**5.3: Fixture-as-spec.** The post's shift #6 in its strongest form, and
Octane is unusually well-positioned: `tests/_fixtures/*.tsrx` +
`tests/differential/_rig.ts` + the evals graders are *executable specifications*
of exactly the behaviors prose keeps failing to convey.

Where a divergence has a canonical fixture, the skill should hand over the
fixture path rather than describe the behavior. Add to
`docs/differences-from-react.md`: a per-divergence "proof" line linking the test
that pins it. This makes the contract checkable and gives an agent something to
run instead of something to believe.

**5.4: Verifier rubrics.** The post mentions rubrics for verification agents.
`core-engineering.md`'s § *Perform an adversarial self-review* is already a
rubric written as prose. Extract it into `.claude/skills/octane-core-extend/
reference/self-review-rubric.md` as a checklist a review subagent can execute
item-by-item, and let the global `deep-review` skill consume it.

---

### Phase 6: Instructions move into tool descriptions

**6.1: Cut `instructionsFor()` in `octane-mcp-server/src/index.js`.** It
currently injects a ~60-word standing mandate ("Before creating or materially
changing Octane software, call `octane_engineering_plan` and load the
`build-octane-software` skill…") into *every* session of *every* connected
agent, whether or not they touch Octane code. That is the definition of
"upfront context that should be progressive disclosure."

Replace with one orienting sentence. Move the *when to call me* logic into each
tool's own `description`, that is where the model looks when deciding.

**6.2: Rewrite tool descriptions as triggers.** Current:
`'Classify changed paths by Octane repo area.'`: describes the *what*. Better:
`'Call before editing unfamiliar paths in the octane monorepo to learn which
area owns them and which validation gates apply.'`: describes the *when*.

Apply across all ~11 tools on both servers.

**6.3: Reconcile the two MCP surfaces.** `packages/octane-mcp-server` exposes
`octane_bridge_react_package`; the hosted `website-mcp` exposes
`octane_bridge_scan` for the same capability. The hosted server also exposes
`octane_docs_search`/`octane_docs_read`/`octane_compile`, which the stdio
server's README does not document. Two servers with divergent names for one
capability is a tool-interface defect under shift #2. Pick canonical names,
alias the old ones for a release, document both surfaces in one table.

**6.4: Expressive parameters over examples.** Audit each tool's schema for
enums where free strings are accepted today. `octane_engineering_plan`'s
`scope`/`changeKind` are already good models; `octane_validate_plan`'s
`taskKind` and `octane_benchmark`'s suite name should be enums sourced from the
runner manifest so the valid set is self-documenting and cannot drift.

---

### Phase 7: Prevent regrowth

Context bloat is not a one-time cleanup; it is a slow leak. Add the gates that
make the leak visible.

**7.1: `pnpm context:budget:check`.** Fails CI if resident agent context
(`CLAUDE.md` + the frontmatter descriptions of every `.claude/skills/*`) exceeds
a committed budget (proposal: **2,500 tokens**). Same shape as the existing
`bundle-size` benchmark gate: a size limit on a shared resource, which this
repo already knows how to enforce.

**7.2, The divergence-list link check** from Phase 2: every bullet in
CLAUDE.md's divergence section must resolve to a heading in
`differences-from-react.md`.

**7.3: Re-run the ablation each release.** Wire `ablate-context.mjs` into the
release checklist so the number that justified the cut stays true as models
change. The post's whole premise is that the right context depends on the model
generation; that means this is a recurring measurement, not a migration.

**7.4: Run `/doctor`.** Claude Code ships the rightsizing analysis. Run it
against the Phase-2 `CLAUDE.md` and the Phase-3 skills as an independent check
on this plan, and record where it disagrees.

---

## 5. Sequencing and effort

| Phase | Depends on | Effort | Risk | Value |
| --- | --- | --- | --- | --- |
| 1: delete dead/duplicate | n/a | S | none (unreachable files) | M |
| 5.2: repoint divergence ref | n/a | XS | none | M |
| 4.1, `declare module` gate | n/a | S | none | **H**, closes a live shipped defect |
| 0, eval family + ablation | n/a | **L** | eval noise | **H**, gates everything |
| 2: rewrite CLAUDE.md | 0 | M | losing a bucket-K nuance | **H** |
| 3: real skills | 1 | M | routing descriptions must be good | **H** |
| 4.2-4.4: machinery | n/a | M | new diagnostics need their own tests | H |
| 6: tool descriptions | n/a | S | MCP rename needs a deprecation window | M |
| 5.1/5.3/5.4: references | n/a | M | doc moves break external links | M |
| 7: anti-regrowth | 0,2,3 | S | budget number needs calibration | M |

**Land first, before Phase 0 completes** (no measurement needed: these are
either unreachable files or a live defect): **1.1-1.3, 4.1, 5.2.**

**Do not land before Phase 0 completes:** Phase 2. That is the one change whose
value is a claim about model behavior, and this repo does not accept unmeasured
behavioral claims.

---

## 6. Honest risks

1. **The eval family is the expensive part** and it is the gate. If Phase 0 is
   skipped, Phase 2 becomes an unmeasured behavioral change to the most-loaded
   file in the repo: exactly what `core-engineering.md` forbids.
2. **Compression can silently drop a contract.** Mitigated by the Phase-7.2 link
   check, but only for divergences. Nothing structurally protects the other
   compressed sections; review them against the current file line-by-line.
3. **Anti-priors may need *more* context, not less.** If the ablation shows
   `proposed` under-performing `full` specifically on divergence tasks, the
   correct response is to *expand* the divergence section and cut harder
   elsewhere, not to declare the plan failed.
4. **Model-generation coupling.** Everything here is tuned for Opus 5 / Fable 5.
   Contributors on other models (the repo generates Cursor, Copilot, Gemini, and
   `.codex` targets) may be running weaker models for which the deleted
   guardrails were load-bearing. Consider keeping a fuller rule set on the
   non-Claude targets: RuleSync's per-target output makes this cheap, and it is
   an argument *for* the current multi-target generation rather than against it.
5. **`/doctor` may disagree with this plan.** That is a feature. Run it (7.4)
   and record the deltas rather than defending the analysis.

---
name: concise-code
description: >-
  Keep a change small and in the existing idiom - size the plan and weigh
  smaller alternatives before writing it, reuse the mechanism that already owns
  the behavior instead of adding a parallel one, and simplify the diff before
  handoff. Use when planning any change beyond a few lines, before readying a
  PR, or when reviewing agent-written code for bloat.
---
# Skill: Concise code

Between July and October 2026 the whole client runtime grew from 37 kB to
181 kB gzip, and `runtime.ts` from about 17,000 to 52,000 lines. Most of it
arrived one reasonable-looking change at a time: a branch per symptom, a second
helper beside the first, a flag for a case the existing mechanism almost
handled. No check fails on bytes, so the control is here: while you design, and
before you hand off.

The goal is fewer concepts and less code to read, ship, and maintain, not fewer
characters. Keep what earns its cost: fast paths that `performance-audit` asks
for, comments that state invariants (the runtime's comments are its design
spec), and tests of observable behavior. Code copied from an upstream React
library follows `octane-react-library-port`, where fidelity to upstream wins
over local brevity.

## 1. Size the plan before writing it

The first design that works is often the biggest. Before editing, write down
what the plan adds: files, modules, exports, types, options, flags, Block or
Scope fields, runtime imports, and lines of source by where they ship:

- the client runtime (`packages/octane/src` outside `compiler/`) ships to every
  app;
- the compiler and build plugins run in every build;
- a binding ships to its users;
- tests, scripts, and benchmarks ship nowhere, but are still read and kept.

When the plan adds a module, a mechanism, a public option, a hot-record field,
or more than about 50 lines of runtime source, sketch at least two
alternatives with their own estimates before writing any of them:

- **Extend the owner.** Change the existing mechanism so it covers this case
  instead of adding a sibling that handles only this case. If the owner needs
  reshaping first, do that as a behavior-preserving commit, then make the now
  small change.
- **Remove the case.** Change the data or the order of operations so the case
  cannot arise, rather than detecting and repairing it afterwards.
- **Fix the producer once.** When several consumers would each need a guard,
  fix the one place that produces the bad value.
- **Pay only when used.** Put feature-only code behind the capability or driver
  that owns it, so apps without the feature never ship it.
- **Delete.** Check whether the change makes existing code, an older
  workaround, or a test-only path unnecessary.

Choose the smallest alternative that holds the contract and the hot-path rules.
A larger one is fine when it is earned: name the mode it fixes, the hot path it
keeps fast, or the test the smaller one fails. A fix much larger than its bug
usually sits in the wrong layer or reimplements something, and a branch for one
feature inside a general mechanism usually means the fix is too shallow. Either
way, re-read the owner before writing it.

| The thought | What to do instead |
| --- | --- |
| "It is only a few more lines." | Every change says that. Count what the whole plan adds. |
| "A new helper is cleaner than touching the old one." | Two mechanisms for one job is the duplication. Change the old one. |
| "Safer to handle that case too." | If the types or invariants exclude it, the branch is dead code. |
| "We will want this option later." | Add it with its first caller. |
| "The review asked about this gap." | A review told to find gaps always finds some. Close the ones that affect correctness or the contract. |

## 2. Find the mechanism that already does it

Before writing a helper, `git grep -n` the DOM API, AST node type, error text,
or concept it needs across `packages/octane/src` and the package you are
changing. Read the nearest feature that solves a similar problem and follow its
shape. These shared homes are the ones most often duplicated:

| Need | Use |
| --- | --- |
| Which attributes render, their names and namespaces, void elements | `packages/octane/src/dom-tables.js`, shared by the compiler, client, and SSR |
| Delegated event names | `event-names.js` |
| Unitless style props, style values, hyphenation | `style-values.js` |
| URL attribute sanitizing | `sanitize-url.js` |
| `class` and `className` composition | `normalizeClass` in `class-names.ts` |
| Own-property checks | `hasOwnProp` in `has-own.ts` |
| Posting a task | `postHostTask` in `host-task.ts`; `schedulePostPaint`, `createResizeObserver`, and `resumeOnSettle` for their cases |
| Framework errors visible in production | the catalog in `packages/octane/error-codes/` |
| Generated JavaScript | `@tsrx/core` builders and clone helpers, per `core-engineering` |
| Mounting and flushing in core tests | `packages/octane/tests/_helpers.ts` and the other `_*.ts` harnesses |
| Script path arguments | `scripts/file-selection.mjs` |

If no shared home exists and a second place needs the same logic, move it to a
module both import rather than copying it. A "keep in sync with" comment marks a
copy; `dom-tables.js` replaced exactly such copies.

## 3. Write in the existing idiom

- **One way per job.** Match the surrounding naming, error construction, control
  flow, comment density, and test layout. A better pattern is its own refactor
  that converts the old sites, not a second dialect beside them.
- **Extract on a shared reason to change.** Copies that merely look alike can
  stay; the third copy usually decides it. If you cannot name the helper
  plainly, it is not an abstraction yet. A helper whose boolean switches
  between two behaviors is two functions: the wrong abstraction costs more than
  the duplication it removed, so inline it back into its callers and extract
  again.
- **No speculative generality.** No parameter, option, overload, or extension
  point without a caller in this change.
- **No defense against the impossible.** Validate at boundaries such as the
  public API, parser input, the network, and user data, then trust internal
  callers. Do not catch only to rethrow or ignore, and do not add `?.` or
  fallbacks for values that cannot be missing.
- **No pass-throughs.** No wrapper, alias, or re-export that only renames.
- **No compensating state.** Do not add a field or flag to work around an
  ordering problem; fix the order.
- **Comments say why.** Do not restate the code, narrate the change, or record
  history; the commit message holds that.
- **Tests extend what exists.** Add to the area's test file and fixture, use
  `it.each` or a table for cases that differ only in inputs, and never add a
  test-only branch to shipped code.

## 4. Simplify the diff before handoff

Read your diff as if you had to maintain it for someone else. Start with the
numbers; `git diff` skips untracked files, so commit or `git add -N` them first:

```bash
base=$(git merge-base HEAD origin/main)
git diff --stat "$base"
git diff --numstat "$base" | awk '$3 ~ "^packages/[^/]+/src/" { a += $1; d += $2 }
  $3 ~ "^packages/octane/src/" && $3 !~ "/compiler/" { ra += $1; rd += $2 }
  END { print "src +" a+0 " -" d+0 ", runtime +" ra+0 " -" rd+0 }'
git diff --diff-filter=A --name-only "$base"   # each new file needs a reason
git diff -U0 "$base" | grep -E '^\+.*\bexport\b'   # each new export needs a caller
git diff -U0 "$base" -- '*.ts' '*.tsx' '*.tsrx' '*.js' '*.mjs' | grep -E '^\+[^+]' |
  sed -E 's/^\+[[:space:]]*//' | awk 'length >= 40' | sort | uniq -cd | sort -rn | head -20
```

The last command lists added lines that occur more than once, which is usually
pasted code. Then take each hunk in turn:

1. **Delete.** Try removing each added branch, parameter, helper, field, and
   comment. Keep it only if the contract, a test, or a hot-path rule needs it.
2. **Reuse.** `git grep` each new function's core call. If another function
   already makes it, call or extend that one.
3. **Collapse.** Merge branches, functions, and tests that differ only by a
   value.
4. **Match.** Compare each new construct with the nearest code doing the same
   job. A different style needs a reason.
5. **Proportion.** Compare the diff with the size of the problem, and with the
   smallest alternative from step 1 now that the real diff exists.
6. **Bytes.** For runtime changes, measure with the commands in
   `performance-audit` § Bundle bytes and justify any growth.

Stay inside the task: delete what your own change made unused, and report
duplication outside your diff as a follow-up. Generated files belong to
`pnpm sync`; never trim them by hand. When reviewing someone else's diff, give
each finding a file:line, what is duplicated or unneeded, and the simpler form
or the existing helper to call, and skip anything that would change behavior.

## Report

Under Validation in the PR body:

```md
- `concise-code`: src +A −D (runtime +R −S); new files and exports: <each, with its reason>; alternatives: <option, estimated size, why rejected>; bytes: <rows moved, or not applicable>
```

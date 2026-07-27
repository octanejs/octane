---
'octane': patch
---

Compiler-inferred hook dependency arrays now resolve two capture-analysis
defects.

A computed key in a binding pattern (`const { [key]: picked } = source`) is a
read of the surrounding scope, but the scope walk never visited it, so the
identifier resolved to no binding at all — indistinguishable from a global —
and was dropped. Any effect keyed on that value kept a stale capture and never
re-ran when it changed. The fix covers every position a pattern can appear in:
declarations, function parameters, catch clauses, for-of heads, and patterns
nested in any of them.

Module-scope `const` declarations, and module-scope `function` and `class`
declarations that nothing reassigns, are no longer emitted as dependencies. A
dependency array tracks what can change between renders, and these are
evaluated once for the program's lifetime — the conclusion imports already got
here, that `exhaustive-deps` reaches for any outer-scope value, and that
autoMemo already reached for same-module function declarations. Previously
`import { fmt } from './fmt'` and a byte-identical local helper produced
different arrays. A local `const` that only names such a value, or that binds a
literal, is omitted for the same reason.

Module-scope `let` and `var` remain tracked, since any later statement may
rebind them. A member read through a module-scope `const` (`CONFIG.mode`) is
now omitted, matching the answer a namespace import already gave: a module-level
object mutated in place is not witnessed by a dependency array either way.

A regex literal is not treated as an invariant initializer. ESTree spells
`/foo/g` as a `Literal`, but it allocates a fresh RegExp on every evaluation and
carries mutable `lastIndex` state, so a local `const pattern = /foo/g` stays
reactive. The predicate is now shared with the one `compile.js` already used for
the same question.

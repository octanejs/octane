---
'octane': patch
---

Derived values are now cached at their declaration. A `const` whose initializer
performs a call during render — `const visible = todos.filter((t) => !t.completed)`
— is lowered to a compiler-owned memo keyed on the component locals it reads, so
its identity is stable until those inputs change.

This is what makes region memoization worth having. A region keys on the
identity of what it renders, so a derived list rebuilt on every render defeated
its cache unconditionally: TodoMVC's list region was emitted with seven
dependencies, six of them already stable, and never hit because the seventh was
a fresh array every render.

Never cached: hook calls (recognised by naming convention, including React's
`unstable_use*` staging prefix — a cache around a hook freezes its state cell
and any subscription it owns), `let` declarations, which stay the escape hatch
for a value that must recompute every render, and calculations the render tree
never reads. Server compiles are untouched, since a server render evaluates each
body once.

The cached value follows the same pure-render contract as the surrounding
regions: a calculation reading state no dependency witnesses keeps its old
value. Note that `{header.getIsSorted()}` inline in a template is still not
memoized while `const s = header.getIsSorted()` is, so hoisting that expression
into a local changes its reactivity — see "Derived values are cached at their
declaration" in `docs/differences-from-react.md`.

Paired benchmarks, same machine (js-framework is the control: byte-identical
codegen with and without the pass, and it still moved ±8%, which calibrates the
run's noise floor):

  chat-stream  switchConv      3.92ms → 1.80ms  (−54%)
  chat-stream  streamCoarse    0.56ms → 0.30ms  (−46%)
  chat-stream  streamFine      0.94ms → 0.66ms  (−30%)
  chat-stream  type160         1.22ms → 1.02ms  (−16%)
  memo-wall    parent_equal_B  0.226ms → 0.109ms (−52%)
  memo-wall    ctx_wall_B      0.569ms → 0.453ms (−20%)
  todomvc      toggleAllOff    0.24ms → 0.12ms  (−50%)
  todomvc      toggleAllOn     0.24ms → 0.14ms  (−42%)
  todomvc      filterCycle     0.80ms → 0.46ms  (−42%)

No operation regresses by the repository's compare rule. Compiled output grows
0.25% gzip on the `codegen-size` corpus.

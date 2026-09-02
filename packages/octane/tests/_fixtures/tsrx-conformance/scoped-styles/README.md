# Scoped style conformance fixtures

Target-neutral fixtures for lexically scoped `<style>` blocks, `$class`, and
`apply` ([RFC tsrx-org/RFCs#1](https://github.com/tsrx-org/RFCs/discussions/1)).
Each `<name>.tsrx` compiles as one module (imports are never resolved) and its
sibling `<name>.expected.json` states what the output must contain. A subdirectory
groups the modules of a multi-file example; every `.tsrx` inside is still compiled
on its own.

The TSRX runner lives in
`packages/tsrx/tests/shared/scoped-styles-conformance.js`. Other compilers vendor
this directory and implement the same checks.

## Labels

Hashes are position-derived and never appear in the JSON. Every scope and every
assigned block is named by a **label**, and the label resolves to a hash by
reading the marker selector `.<label>.<hash>` back from the compiled CSS.

Fixture conventions that make this work:

- Every `<style>` block with a body **starts with its label's marker rule**,
  `.<label> { --label: <label>; }`. Blocks that share a scope repeat the scope's
  label, so the sequence of marker rules in the CSS is the sheet emission order.
- A standalone block's marker must match an element, or it is pruned and has no
  hash: put the label in the class list of some element the scope reaches
  (`<div class="e1 scopeA">`). Assigned blocks keep their class selectors, so they
  need no element.
- An assigned block's label is its variable name.
- A label of the form `import:<expr>` is not resolved; it stands for the runtime
  read `<expr>.$class` of a block the compiler cannot see (an import, or any block
  whose `$class` is not fully static).

## `expected.json`

```json
{
  "elements": {
    "e1 scopeA": ["scopeA", "import:theme"],
    "{theme.dark}": ["scopeA"]
  },
  "cssOrder": ["theme", "scopeA", "scopeA", "scopeB"],
  "pruned": ["p", "div"],
  "classMaps": { "theme": ["base", "theme"], "bundle": ["import:a", "import:b"] },
  "knownFailure": "optional: why the compiler currently disagrees"
}
```

- **`elements`** — authored `class` value → labels the element must carry, in
  order: enclosing scope hashes outer → inner, then applied themes. Static labels
  are appended to the authored literal (`class="e1 scopeA <hashA>"`). A runtime
  label makes it a template literal (``class={`e1 <hashA> ${theme.$class}`}``). A
  key wrapped in braces is an expression-valued authored class and matches
  ``class={`${theme.dark} <hashA>`}`` (or the untouched `class={theme.dark}` when
  the chain is empty). Both `class=` and `className=` are accepted.
- **`cssOrder`** — labels of the marker rules in emission order: a scope's sheets
  contiguous in source order, nested scopes after their parent, siblings in source
  order, assigned blocks at their declaration position. `cssHash` must equal the
  distinct hashes of this list, in order.
- **`pruned`** — selector texts expected inside `/* (unused) … */` comments, in
  order. Standalone blocks prune selectors that match nothing in their reach;
  assigned blocks that are neither exported nor applied prune every non-class
  selector; exported or applied blocks prune nothing.
- **`classMaps`** — assigned-block variable → `$class` composition: applied
  blocks' compositions first (transitively), the block's own label last. `own` may
  stand for the variable's label. Adjacent static hashes share one string literal
  and runtime labels are concatenated (`'<a> ' + x.$class + ' <own>'`). When the
  composition includes the block's own label, the map must also carry
  `'<label>': '<own hash> <label>'`.
- **`knownFailure`** — when present, the fixture documents a discrepancy between
  the RFC and the compiler and is expected to fail until it is fixed.

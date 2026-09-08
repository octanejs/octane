# Scoped status panel

Implement `src/App.tsrx` as a build-status panel whose CSS is written in
sibling-scoped `<style>` blocks.

The module must continue to export `App`.

Requirements:

- `App` renders a `<section id="panel" class="panel">` containing an
  `<h1 id="title" class="title">`, a `<button id="toggle">`, a summary
  paragraph, and (only while expanded) a details paragraph.
- The panel's `<style>` block declares the `.panel` and `.title` rules. A
  block styles the items beside it and everything below them, never the
  element that contains it, so the block and the section are siblings in the
  output fragment: `<><style>…</style><section …>…</section></>`.
- The `<p id="summary" class="summary title">` is rendered by a nested `@{ … }`
  template whose output fragment carries its own `<style>` block declaring the
  `.summary` rule beside the paragraph. Only that nested scope may use the
  `.summary` rule.
- Clicking `#toggle` toggles the expanded state. While expanded, an `@if`
  branch renders a fragment holding a `<style>` block declaring the `.details`
  rule and `<p id="details" class="details">`; the branch's fragment scope
  owns that rule.
- The module ships exactly three scoped style sheets, one per scope, in the
  order panel, summary, details. The details sheet is part of the module even
  while the branch is not rendered.
- Every element carries the scope classes of all of its enclosing scopes: the
  section and title only the panel scope, the summary the panel and summary
  scopes, the details paragraph the panel and details scopes.

Do not use `apply`, a third-party CSS helper, or inline `style` props. Do not
edit the grader or add dependencies.

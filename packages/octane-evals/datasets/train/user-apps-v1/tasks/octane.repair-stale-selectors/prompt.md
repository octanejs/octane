# Repair stale selectors after a refactor

`src/App.tsrx` is a settings panel whose markup was refactored: the actions row
was renamed from `.toolbar` to `.actions`, and the `.close` button was removed.
The scoped `<style>` block was never updated, so `octane analyze --strict`
reports selectors that match nothing and the `.actions` row lost its styles.

Repair `src/App.tsrx` so the current markup is styled and the stylesheet
carries no stale selectors.

Requirements:

- Keep rendering `<section class="panel">` with the existing
  `<h2 class="title">`, the `<div class="actions">` containing the `Save` and
  `Cancel` buttons and the `<span class="hint">`, and no `.toolbar` or
  `.close` elements.
- The `.actions` row keeps the flex layout the old toolbar had:
  `display: flex` with `gap: 8px`.
- The `.hint` span keeps its right-aligned placement: `margin-left: auto`.
- The `.title` rule stays.
- Rules for the removed `.close` button and the renamed `.toolbar` must not
  remain — not as matching selectors and not as `(unused)` remnants in the
  emitted sheet.
- `octane analyze` reports zero diagnostics for the file. Do not silence them
  with `octane-ignore` comments or by deleting the style block.
- Keep styles in the scoped `<style>` block; do not move them to inline `style`
  props.

Edit only `src/App.tsrx`. The workspace scripts are the public validation
commands: `pnpm run check` runs `octane analyze src/App.tsrx --strict`, and
`pnpm run typecheck` runs `tsrx-tsc --noEmit -p tsconfig.json`. Both must pass.
Do not edit the grader, the toolchain files, or add dependencies.

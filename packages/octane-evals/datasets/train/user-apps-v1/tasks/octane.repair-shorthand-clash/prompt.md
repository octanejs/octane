# Repair a shorthand/longhand merge clash

`src/App.tsrx` renders a card inside a board. The exported `callout` theme
declares the card's accent top border, and the board's scoped `<style>` block
applies that theme — but the block's `.card` rule declares a full `border`
shorthand. Because the scope sheet lands after the theme sheet, the shorthand
silently resets `border-top-color`, and `octane analyze` reports an
`octane-css-shorthand-longhand-clash` error.

Repair `src/App.tsrx` so the intended borders survive the merge.

Requirements:

- The module continues to export `callout` and `App`, and `callout` stays a
  `<style>` block whose `.card` rule carries the `border-top-color: #d93025`
  declaration — the theme remains the single source of the top border color.
- `App` keeps rendering `<section class="board">` with an `<article
  class="card">` containing the `Usage` heading and paragraph, and keeps
  applying `callout` through a `<style apply={callout}>` block in that scope.
- The card keeps a `1px solid` border on every side. The top border color is
  `#d93025` (from the theme); the right, bottom, and left border colors are
  `#3c4043`.
- The scope's `.card` rule must not write `border-top-color` or the
  `border-top` shorthand, and no `.card` rule anywhere may carry a shorthand
  that resets the theme's top color.
- `octane analyze` reports zero diagnostics for the file. Do not silence them
  with `octane-ignore` comments, and do not fix the merge by moving borders
  into inline `style` props.
- `.card h2` keeps `margin: 0`.

Edit only `src/App.tsrx`. The workspace scripts are the public validation
commands: `pnpm run check` runs `octane analyze src/App.tsrx --strict`, and
`pnpm run typecheck` runs `tsrx-tsc --noEmit -p tsconfig.json`. Both must pass.
Do not edit the grader, the toolchain files, or add dependencies.

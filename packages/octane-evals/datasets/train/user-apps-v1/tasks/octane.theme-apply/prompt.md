# Shared card theme

Implement `src/App.tsrx` as a card list that shares one exported theme built
from scoped `<style>` blocks.

The module must continue to export `palette`, `spacing`, `theme`, `Card`, and
`App`.

Requirements:

- `palette` and `spacing` are assigned `<style>` blocks. `palette` declares the
  `.card` text color and `spacing` declares the `.card` padding. Neither
  applies another block.
- `theme` is an assigned `<style>` block that composes both with
  `apply={[palette, spacing]}` and adds a `.card` border rule and a `.badge`
  font-size rule. All three blocks are exported so other modules can apply them.
- `theme.$class` lists the palette class, the spacing class, and then the
  theme's own class, in that order.
- `Card` applies the theme with a self-closing `<style apply={theme} />` and
  renders `<article id={props.id} class="card">` with its children as content.
  It adds no style block of its own.
- `App` renders `<main id="app">` containing a `Card` with the id `first` and
  the text `First card`, a `Card` with the id `second` and the text
  `Second card`, and a `<span id="badge">` whose `class` prop composes
  `theme.$class` with the literal `badge` class through Octane's native class
  composition.
- The module ships exactly three scoped style sheets, in the order palette,
  spacing, theme. Every card and the badge carry the full theme class chain.

Declare each theme before the code that applies it. Do not use inline `style`
props or a third-party CSS helper. Do not edit the grader or add dependencies.

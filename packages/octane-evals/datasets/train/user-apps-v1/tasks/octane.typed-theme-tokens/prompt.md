# Typed theme-token contract

Implement `src/App.tsrx` so it declares a typed theme-token contract with
`defineThemeTokens` from `octane/theme-tokens` and renders a pricing card
styled through that contract.

The module must continue to export `tokens` and `App`.

Requirements:

- `tokens` is the value returned by `defineThemeTokens`. The declared contract
  keeps the starter's leaves: `colors.surface` is `#ffffff`, `colors.ink` is
  `#1b1b23`, `colors.accent` is `#4353ff`, and `space.cardPad` is `1.25rem`.
- `tokens` also declares one variant named `dark` that emits under the
  `.theme-dark` selector and overrides `colors.surface` to `#16161e` and
  `colors.ink` to `#f2f2f7`.
- Every token leaf on the returned object is its `var(--name, fallback)`
  reference (for example `tokens.colors.surface` is
  `var(--colors-surface, #ffffff)`), `tokens.vars` exposes the bare
  custom-property names, and `tokens.raw` returns the declared values.
- `App` renders `<main id="app">` containing, in order, a plain `<style>`
  element whose child is `tokens.css`, one scoped `<style>` block, and an
  `<article class="card">` with an `<h2 class="card-title">`, a
  `<p class="card-price">`, and an `<a class="card-cta" href="#upgrade">`.
- The scoped block styles `.card` with `background`, `color`, and `padding`
  declarations that read the emitted custom properties through `var(--*)`
  references, and `.card-title` with a `color` declaration that reads the ink
  custom property. Literal color or spacing values do not appear in those
  declarations.
- The link's `style` prop reads `tokens.colors.accent` for its `color`.

Keep all implementation code in `src/App.tsrx`. Do not add dependencies or
modify the grader.

---
'octane': patch
---

Add `defineThemeTokens` (`octane/theme-tokens`): declare a theme-token contract once in a plain `.ts` module and let TypeScript check names and value types natively. The returned object keeps the declared shape with every leaf a `var(--name, fallback)` reference, plus `vars` (bare `--name` names), `raw` (the declared values), and `css` (the `:root` sheet plus per-variant selector/media blocks). Variants are excess-key-checked against the contract, `prefix`/`selector` control emission, and `raw`/`vars`/`css` are reserved output fields.

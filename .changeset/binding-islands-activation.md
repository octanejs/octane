---
'octane': minor
---

`'use dom bindings'` views can now drive whole islands without the renderer:

- Imported signal reads (`count$.get()`, `count$.latest(fallback)`) in projections, branch tests, lists and setup or block `const` declarations subscribe instead of raising an activation diagnostic. A pending read keeps the last DOM until its source changes.
- `@try`/`@pending`/`@catch` compile into binding programs, select their arm like the renderer, adopt whichever arm the server rendered, and claim a boundary that is still streaming.
- `useLayoutEffect(callback, [])` and `useEffect(callback, [])` run once after a view activates and clean up when it leaves.
- An independent `<Hydrate>` whose only child is a prop-less, zero-argument binding view imported from a `.tsrx` module activates through that view's program, so its chunk no longer loads the renderer. Other islands keep the renderer activator.
- A live binding over signals whose owner retires, as a document's signals do when the page is left, now stops quietly with its last DOM instead of throwing.

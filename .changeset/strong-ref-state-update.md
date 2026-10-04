---
'octane': minor
'@octanejs/cli': patch
'@octanejs/mcp-server': patch
---

Strong mode now rejects a synchronous state update in a host element's callback ref with `OCTANE_STRONG_REF_STATE_UPDATE`. Octane calls a callback ref while the element commits, before paint, so the check follows the effect setup rules. It covers inline and local functions, a state setter passed as the ref, and functions in a `ref={[...]}` list. When the callback copies a DOM measurement into state, the error names `useLayoutSnapshot`. Updates the ref defers to `requestAnimationFrame`, a timer with a positive delay, or an observer or event listener stay legal, and a component's `ref` prop is not checked. `octane explain` and the MCP server's `octane_strong_explain` describe the new code and its migration recipe.

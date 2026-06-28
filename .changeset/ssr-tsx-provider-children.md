---
"octane": patch
---

SSR + hydration now work for `.tsx` `<Context.Provider>` and de-opt host subtrees:

- The server `Provider` only rendered children when they were a render function (the
  `.tsrx` shape); a React-style `createElement(Provider, {}, <child/>)` passes a
  descriptor, which was silently dropped — direct-JSX provider SSR rendered empty. It
  now renders descriptor / array / primitive children too.
- `ssrComponent` now normalizes a component body that RETURNS a `createElement`
  descriptor (the de-opt return path) instead of stringifying it to `[object Object]`.
- A de-opt HOST element whose children contain COMPONENTS (`<div><Comp/><Comp/></div>`
  returned via the de-opt path) now hydrates without mismatch: the client
  `hostElementBody` adopts the server host node instead of building a fresh one, and the
  server emits the matching `childSlot`/`forSlot`/component block nesting
  (`ssrDeoptBlockChildren`).

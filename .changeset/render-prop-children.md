---
"octane": patch
---

The compiler now supports React-style render-prop children — `<Comp>{(data) => <jsx/>}</Comp>`. Previously only the octane `{(data) => @{ … }}` form (a JSXCodeBlock arrow) was lowered; a bare-JSX arrow body left its JSX un-lowered (invalid output), and a function child was always wrapped as a scope-receiving child renderer (so the consumer couldn't call it as `props.children(data)`). Now a component whose sole child is a `(args) => <jsx/>` / `(args) => (<jsx/>)` / `(args) => <>…</>` render-prop has that JSX lowered to `createElement(...)` while the arrow is preserved and passed RAW, so the component can call it with arbitrary args and render the returned descriptor. (Client/`.tsrx` + `.tsx`; render-prop children that return JSX are not yet supported under SSR.)

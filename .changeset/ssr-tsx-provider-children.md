---
"octane": patch
---

SSR no longer drops `.tsx` `<Context.Provider>` children. The server `Provider` only
rendered children when they were a render function (the `.tsrx` shape); a React-style
`createElement(Provider, {}, <child/>)` passes a descriptor, which was silently dropped
— direct-JSX provider SSR rendered empty. The server Provider now renders descriptor /
array / primitive children too. Relatedly, `ssrComponent` now normalizes a component
body that RETURNS a `createElement` descriptor (the de-opt return path) instead of
stringifying it to `[object Object]`.

---
"octane": patch
---

SSR now renders value-position JSX. React-style render-prop children that return
JSX (`<Comp>{(data) => <span>{data as string}</span>}</Comp>`), `{xs.map(x => <li>{x as string}</li>)}`,
and render-props returning a fragment now server-render instead of throwing the
`ssrUnsupported` error. The compiler lowers the JSX to `createElement(...)` host
descriptors (a new server `createElement` mirrors the client's), and `ssrChild`
serializes them — a host descriptor to `<tag …>…</tag>` (void-element aware), an
array to one hydration block per item, and a component descriptor through
`ssrComponent` (children preserved). The output hydrates cleanly: the de-opt
`childSlot` array path no longer sweeps the server-rendered item ranges before
adopting them.

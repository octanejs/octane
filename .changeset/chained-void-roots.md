---
'octane': patch
---

Specialize the common app-entry root shapes in production builds, not only
`createRoot(target).render(App)` in a plain `.ts` module.

A root whose whole lifetime renders compiled `@{}` components skips the
returned-value reconciler and its bundle graph. That proof now covers:
- `createRoot(el).render(<App />)` and `hydrateRoot(el, <App />)` in `.tsx`
  and `.tsrx` entries;
- the documented module-level `const root = createRoot(el); root.render(App)`
  when `root` is not exported; and
- `hydrateRoot(el, App, props)` in plain modules.

A one-component Vite entry that renders `<App />` drops from about 70 KB to
28 KB gzip, and a direct `hydrateRoot` entry from about 88 KB to 50 KB. On a
proven root, `<App a={x} />` with literal, function, or identifier attribute
values is passed to the root as `App` plus its props, with live `defaultProps`
applied as before. Keys, children, spreads, and other attribute expressions
keep the element path.

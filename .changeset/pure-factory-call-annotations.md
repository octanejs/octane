---
'octane': patch
---

Let esbuild tree-shake unused `createContext`, `memo`, `lazy`, and `createPortal`
results.

Octane declares these factories `/* @__NO_SIDE_EFFECTS__ */`. Rollup and Vite
apply that annotation to calls in other modules, but esbuild never does: it
decides tree-shaking per file. Under esbuild, an unused module-scope
`const Ctx = createContext(…)` therefore counted as a side effect and pulled in
the whole client runtime through the context's provider body.

The compiler now marks direct calls to these imports with `/* @__PURE__ */`, the
call-site convention every bundler honors. It does this for compiled
`.tsrx`/`.tsx` modules and for plain `.ts`/`.js` modules, including modules with
no hooks. Server output still marks only `lazy()`, because the server
`createContext` registers the context it creates. Calls through a local that
shadows the import are left alone.

In the `@octanejs/aria` minimal-import bundle, which imports only
`useSeparator`, esbuild output drops from 197,180 to 8,667 bytes raw (63,197 to
3,349 gzip). Vite output is unchanged.

---
'@octanejs/tiptap': patch
---

Merge `Context.ts` into `Context.tsrx`, restoring the one-file shape of
upstream `Context.tsx`. The two modules shared the `./Context` specifier, which
is ambiguous under resolvers that prefer `.tsrx`: `Context.tsrx` self-imported
(missing `EditorContext`/`useCurrentEditor`) and `index.ts`'s two star-exports
resolved to the same module, producing duplicate `EditorContext`,
`EditorContextValue`, and `useCurrentEditor` re-exports for consumers.
---

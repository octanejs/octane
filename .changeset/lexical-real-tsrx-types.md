---
'@octanejs/lexical': patch
---

Type the component exports. The package typechecked with `tsgo`, which cannot
read `.tsrx`, and an ambient `declare module '*.tsrx'` silenced the resulting
resolution errors. That made all 32 exported components (`LexicalComposer`,
`ContentEditable`, the plugins) resolve to `any`, both inside the package and in
what it re-exports.

It now typechecks with `tsrx-tsc`, which reads `.tsrx` directly, so the shim is
gone and the components carry their real prop types.

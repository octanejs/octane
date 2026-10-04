---
'@octanejs/aria': patch
'@octanejs/base-ui': patch
'@octanejs/cmdk': patch
'@octanejs/docusaurus': patch
'@octanejs/drei': patch
'@octanejs/dropzone': patch
'@octanejs/floating-ui': patch
'@octanejs/image-crop': patch
'@octanejs/jotai': patch
'@octanejs/lexical': patch
'@octanejs/opentui': patch
'@octanejs/pdf': patch
'@octanejs/radix': patch
'@octanejs/recharts': patch
'@octanejs/select': patch
'@octanejs/shadcn': patch
'@octanejs/styled-components': patch
'@octanejs/swr': patch
'@octanejs/tanstack-router': patch
'@octanejs/vaul': patch
'@octanejs/xyflow': patch
---

Remove unused imports and locals from published source, so these packages
typecheck in an application that enables `noUnusedLocals`.

These packages ship TypeScript and `.tsrx` source rather than declaration files,
so `skipLibCheck` does not exempt them: the application's compiler checks our
modules with the application's own options. Importing `linkOptions` from
`@octanejs/tanstack-router` under `noUnusedLocals`, for example, reported six
errors for imports in `link.ts` and `routeHookTypes.ts` that nothing read
(#1694). Runtime behavior is unchanged.

The brand fields on Base UI's `AlertDialogHandle` and `DrawerHandle`, and the
`ctx` constructor property on OpenTUI's `SpanRenderable`, are now `protected`
instead of `private`. A protected member keeps the handles nominally typed, as
the private one did, and the constructor still assigns `ctx`, but the compiler no
longer reports either as unused.

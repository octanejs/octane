---
'@octanejs/aria': patch
'@octanejs/base-ui': patch
'@octanejs/base-ui-utils': patch
'@octanejs/lexical': patch
'@octanejs/recharts': patch
'@octanejs/select': patch
'@octanejs/spring': patch
'@octanejs/styled-components': patch
'@octanejs/visx': patch
---

Prefix unused parameters and type parameters in published source with `_`, so
these packages typecheck in an application that enables `noUnusedParameters`.

These packages ship TypeScript and `.tsrx` source rather than declaration files,
so `skipLibCheck` does not exempt them: the application's compiler checks our
modules with the application's own options. Importing `createScale` from
`@octanejs/visx/scale` under `noUnusedParameters`, for example, reported the unused
`DiscreteInput` and `ThresholdInput` type parameters on its overloads (#1694).

Only names change. No parameter or type parameter is removed, so call sites,
explicit type arguments, and each function's `length` are unchanged, and runtime
behavior is unchanged.

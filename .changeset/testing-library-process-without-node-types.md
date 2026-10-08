---
'@octanejs/testing-library': patch
---

The default entry now compiles in a program without Node types. It reads
`process.env.RTL_SKIP_AUTO_CLEANUP` through its own declaration of `process`,
so an application that typechecks without `@types/node` no longer gets
`Cannot find name 'process'` from this package's source.

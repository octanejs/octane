---
'octane': minor
---

Run `octane/compiler/typescript` on TypeScript 6 and TypeScript 7.1 or later, as
well as 5.9. On TypeScript 7, `createTextTypeProject` checks `.tsrx` through its
native `typescript/unstable/sync` API and proves the same text facts as on the
classic API, and `validateNativeSignalNames` accepts a TypeScript 7 Program. A
new `typescript` option names the TypeScript to use. A TypeScript without a
supported API, such as 7.0, now disables text facts with a warning instead of
failing the build. The optional `typescript` peer range includes 6 and 7.1.

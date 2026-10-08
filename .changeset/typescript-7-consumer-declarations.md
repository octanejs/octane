---
'octane': patch
---

Let `octane/compiler/typescript`'s declarations type-check in a project whose
`typescript` is TypeScript 7. `validateNativeSignalNames` named
`import('typescript').Program` and `SourceFile`, which TypeScript 7's package
root does not export; it now declares the classic Program it needs
structurally, and still accepts a TypeScript 5.9 or 6 `Program` and
`SourceFile`.

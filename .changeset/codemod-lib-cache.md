---
'@octanejs/codemod': patch
---

Parse TypeScript's library files once per process and share them between the programs a migration builds, instead of parsing the whole default library, `lib.dom.d.ts` included, for each one.

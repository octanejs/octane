---
'@octanejs/codemod': patch
---

Report a rename conflict when an executable relative import names an existing `.js` or `.jsx` path and TypeScript resolves it to a selected `.tsx` source. Preserve the JavaScript path and its type source together. Explicitly type-only references in TypeScript files can still follow the rename.

---
'octane': patch
---

Vite and webpack HMR now hot-update exported arrow components (`export const X = () => <jsx/>` and `const X = () => <jsx/>; export default X`) in place. They previously compiled without an accept boundary, so every edit reloaded the page.

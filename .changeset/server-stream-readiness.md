---
"@octanejs/codemod": patch
---

Warn when migrated code awaits a React DOM server stream's `allReady` before reading the body. Octane may need the reader to pull deferred content before that promise settles.

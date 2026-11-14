---
'octane': patch
---

Preserve React JSX in installed and linked Octane packages when a .tsx file declares React as its JSX source and the build uses `requireDirective`. Native .tsrx exports in the same package still compile with Octane.

---
'octane': patch
---

Keep a module-private Context on the public provider in production builds when any of its providers receives element descriptors as children: under a `descriptorChildren` component or `ReactCompat`, or inside a `@{ … }` function that code calls directly. Production builds previously threw `TypeError: body is not a function` there, while development rendered correctly.

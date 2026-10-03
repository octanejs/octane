---
'octane': patch
---

Give a component rendered inside an `@if` or `@for` arm of a hookless component
the same signal instance on the server and in the browser. A hookless
component's arms, rows and value children no longer lose that component's level
from their signal and query identity, and no longer gain a stray list-item
segment. Hydration now resumes the server's cells for them instead of starting
fresh ones. Hookless siblings also keep their own owners when hydration retries a
suspended `@try` body.

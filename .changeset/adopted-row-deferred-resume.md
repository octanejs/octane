---
'octane': patch
---

Fix a crash when a pending `<Hydrate>` boundary resumes a component that
suspended inside content its parent opened in a server-rendered row.

A deferred boundary's retry resumes the component that suspended before it
renders the rest of the boundary. When a hookless sibling component followed
that component, for example a later row of the same list, the retry picked the
sibling instead and threw `TypeError: Cannot read properties of undefined
(reading 'clear')` once the promise settled. The retry now resumes the
component that suspended.

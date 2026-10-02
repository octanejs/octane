---
'octane': patch
---

Discard the server elements and text that an `@if` or `@switch` arm leaves unclaimed during hydration. When the server rendered a longer arm, the client arm adopts the start of the server's range. Elements or text after the roots of the client arm's own template, or after the single root that a component in the arm adopts in place, stayed on screen with no report. Hydration now steps past those roots, removes the server content after them, and reports one structural `onRecoverableError`, with a development diagnostic at the directive. Every compiled multi-root template now carries its root count, so production hydration finds that end without parsing the template, including for a branch in a helper passed as a render prop.

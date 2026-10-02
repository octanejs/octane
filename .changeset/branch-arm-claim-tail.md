---
'octane': patch
---

Discard the server content that a hydrating `@if` or `@switch` arm leaves after its last component or nested branch. When the server rendered a longer arm, such as one with a trailing element after the same components, that trailing content used to stay on the page with nothing reported. Hydration now removes it, keeps every node the client adopted, and reports the mismatch once to `onRecoverableError`, with one development diagnostic at the branch.

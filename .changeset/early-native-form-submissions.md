---
'octane': minor
---

Add opt-in parser-time capture of native SSR form submissions. Forms naming a behavior owner can accept button, implicit Enter, and requestSubmit commands before client registration, preserving immutable accepted fields and submitter metadata for exactly-once behavior delivery. Behavior roots consume these commands with the optional captureFormSubmissions factory, keeping form routing out of ordinary behavior bundles. Unclaimed commands have a bounded lease, and forms without opt-in preserve native behavior.

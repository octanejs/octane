---
'octane': patch
---

Discard the server content an `@if` or `@switch` arm leaves unclaimed during hydration. When the server rendered a different arm, the client arm adopts the server's range from its start. Server components or ranges left after the client arm's content stayed on screen until the next arm swap. Hydration now removes them and reports one structural `onRecoverableError`, with a development diagnostic at the directive. A dormant `<Hydrate>` boundary whose captures changed before activation discards them without a report.

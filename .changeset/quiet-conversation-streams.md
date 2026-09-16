---
'octane': patch
---

Preserve streamed query delivery when a query waits for another query before
starting. Dependent streams remain attached to the original SSR response and
hydration adopts their delivered results without starting duplicate requests.

Preserve pending dependency snapshots in implicit derived signals and carry
dependency refresh and stream-completion activity through async derivations.

Reuse the empty SSR list-key context between components while preserving copied
keyed paths and request-local signal identity.

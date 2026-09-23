---
'octane': patch
---

Stop rendering a dormant `Hydrate` boundary's earlier captures in development. When a mounted parent changes a dormant boundary's captures or provided context before it activates, Octane now repairs the server HTML's attributes, class, style, and text without a hydration warning or `onRecoverableError`, in development and production. Before this, a legitimately changed text hole reported a recoverable text mismatch. Mismatches in a boundary that activates with unchanged captures are still reported.

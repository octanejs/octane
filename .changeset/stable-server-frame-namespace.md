---
'octane': patch
---

Keep the server component frame namespace in the initial object shape, avoiding a later property transition while preserving HTML, SVG, and MathML parser context through renders and retries.

---
'octane': patch
---

Fix the streaming/buffered SSR livelock for promises created in an ancestor render and passed down through props to descendant `use()` sites (the React "uncached promise" shape). The server compiler now caches inline creations in component-prop position across suspense passes (`<Kid p={make(x)}/>`), warm plans share that same creation instead of racing a second one, and a runtime livelock guard detects non-analyzable recreation shapes and degrades to per-site replay instead of burning 50 render passes and serving only `@pending` fallbacks. The max-pass SSR errors now hint at the recreated-promise cause.

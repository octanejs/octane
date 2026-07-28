---
'octane': patch
---

Preserve provider, error-boundary, and Suspense ownership for JSX child
expressions in variable, prop, and other nested value positions. Context reads,
thrown errors, and pending promises now evaluate under the component tree they
describe in both TSRX and TSX, including server rendering and hydration.

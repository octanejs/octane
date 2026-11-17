---
'octane': patch
---

Let a transition change the selection of a query that came from the server. A `startTransition` render that reads a query a streamed SSR response supplied, or that changes its selection, used to fail with "Streamed candidates are not supported by this prototype". It now stages like any other transition: the adopted result stays on screen while the new selection loads, and the server's channel hands over to the browser's request only when the transition commits. Returning to the adopted selection before then reuses the server result without loading it again. A transition started while hydration still holds a scope's adoption frame, such as from a hydrating layout effect, no longer fails either, and holds the components that showed the server values until it commits.

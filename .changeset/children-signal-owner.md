---
'octane': patch
---

Resolve a component's `signal$`, `derived$` and `query$` handles to the component's own cells when the children it passes to another component read them, as `.tsx` children evaluated by the parent already did. Compiled `.tsrx` children previously got cells of their own in the component that rendered them, so `<Card>{record$.get()}</Card>` started a second request for the query, in the browser and on the server, and a derived read computed from signals the component never updated. The fix covers children rendered in a slot, forwarded through another component's children, or rendered by `<Suspense>`, `<ViewTransition>`, `<ErrorBoundary>` or a context provider, and keeps hydration resuming the server's request.

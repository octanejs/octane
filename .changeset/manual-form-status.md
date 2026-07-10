---
'octane': patch
---

`useFormStatus` now activates for the manual-action idiom (React parity): a `startTransition` called synchronously during a form's submit dispatch whose default was prevented (`onSubmit={e => { e.preventDefault(); startTransition(async () => …) }}`) publishes pending status to that form until every such transition settles. Previously only the intercepted `<form action={fn}>` path published form status. A plain async handler (no transition) or a non-prevented submit still never activates it, and the manual and intercepted paths share the same pending counter so overlapping submissions coalesce.

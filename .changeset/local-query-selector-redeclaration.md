---
'octane': patch
---

Re-select a component-local `query$` when a later render's selector captures new props or state, and recompute a synchronous component-local `derived$` from its captured values. Previously both kept the closure from their first render. An equal selection keeps its request and adopts the new loader without refetching. A changed selection aborts the obsolete request and starts the new one when the render is accepted. A held transition or suspended attempt keeps committed readers on the accepted selection and reuses its pending request when it retries.

---
'octane': patch
---

Diagnose actual eager imported signal `.get()` reads when activating compiled DOM
bindings instead of silently presenting an unsubscribed snapshot. Pass a signal
handle directly for a live binding, or provide a deliberate sample through the
BindingSource snapshot. Props-based sampling, pure foreign `.get()` methods and
already subscribed native attribute projections keep their existing behavior;
ordinary SSR reads are unchanged.

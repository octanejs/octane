---
'octane': patch
---

Keep the form-action submit handler, and the transition graph it starts, out of production bundles that never install a function form action, and emit the compiled setup checkpoint only for component setups that can schedule a render-phase self-update.

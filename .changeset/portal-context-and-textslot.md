---
"octane": patch
---

Value-position portals: context propagation under memo bails + text-mode flips.

Two gaps for a `createPortal(...)` living in a childSlot (a component return,
ternary, fragment root, or render-fn result): a memo boundary that bailed on equal
props never refreshed context consumers INSIDE the portal (the content Block lives in
the slot's embedded PortalSlot, which `refreshContextConsumers` didn't walk — it now
has a portal arm, like the array arm); and `textSlot`'s primitive hot path didn't
recognize a portal-mode slot, so flipping the hole from a portal to a string wrote
the text but left the portal's foreign-target content mounted forever. The
mode-switch guard now routes portal-mode slots through the full classifier, which
tears the portal down.

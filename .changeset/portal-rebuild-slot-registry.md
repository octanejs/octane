---
'octane': patch
---

Release a portal's previous range when it rebuilds under a mounted owner.

A `{createPortal(children, target, key)}` at JSX child position rebuilds its
whole subtree whenever its key, target, or child element type changes. Each
rebuild used to register the new portal alongside the old one instead of in its
place, so an owner that stayed mounted, such as a dialog host keyed by the
selected id, kept every replaced portal and its detached start and end markers
alive until it unmounted. The rebuilt portal now takes over the previous one's
registration.

A transition that rebuilt the portal and then suspended also left the restored
portal unable to receive delegated events, such as clicks inside a dialog,
because rolling back released the target's event listeners twice. Rollback now
restores the previous portal's registration and releases the abandoned one
exactly once.

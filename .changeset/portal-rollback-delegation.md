---
'octane': patch
---

Keep a committed portal's events working after a discarded render created another portal in the same target.

Portals that share a target also share its delegated event listeners, which detach when the last portal releases them. A root render can create a portal and then be discarded, for example when a sibling suspends with no Suspense boundary. In that case both the new portal's creation undo and its owner's teardown released the portal, so the target lost its listeners while a committed portal still used them, and that portal's handlers (a button's `onClick`, say) stopped firing. This affected compiled `createPortal` host children, portals returned as values, and portals that the same render created and removed again. Each portal now releases the target once.

---
'octane': patch
---

Run each queued `useActionState` dispatch with the action that was current when
it was dispatched, matching React 19. Before, a rerender that supplied a new
action while a submission waited in the queue made that submission run the
replacement action. Payloads dispatched after the rerender still use the new
action, and an action error still continues the queue.

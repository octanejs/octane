---
'@octanejs/tauri': patch
---

Resubscribe `useTauriEvent` when switching between a string label and a distinct typed target, such as `'Any'` and `{ kind: 'Any' }`, and release the previous subscription even when its listen promise is still pending.

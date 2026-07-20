---
'octane': patch
---

Controlled `<select>` picks made through the real browser UI (popup, keyboard typeahead) no longer revert before their `change` handler runs. The browser dispatches a pick's native `input` and `change` in separate tasks; octane's controlled restore ran in the microtask between them and snapped the selection back, so `onChange` always read the old value. The pick is now marked in flight on `input`, the `change` dispatch performs the after-handlers restore, and a task fallback still settles a sequence whose `change` never completes (stopped propagation, synthetic lone `input`).

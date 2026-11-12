---
"octane": patch
---

Strong mode hints `OCTANE_STRONG_READ_AFTER_SET` when an event handler or other non-render function reads a state value after calling its setter or dispatch earlier in the same block, such as `setDraft(''); if (draft) send(draft)`. The read sees the render snapshot, not the value just set. It is a hint, not an error, and emitted code is unchanged.

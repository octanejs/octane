---
'octane': patch
---

Track `useTransition` pending ownership without allocating a `Set` per transition. A batch stores its starting hook in a field and the hook counts its pending batches, so a start → pending → settle cycle allocates the same three collections it did before the React behavioral audit fixes while keeping every corrected behavior: nested starts from another hook share the batch's pending window, a hook starting nested transitions inside its own Action is counted once, and a re-held batch becomes pending again.

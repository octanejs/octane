---
'octane': patch
---

A `signal$`, `derived$`, or `query$` declared inside a custom hook now belongs to each call of that hook. Calling `useUser$(a)` and `useUser$(b)` in one component previously shared one cell, so the second call showed the first call's data and never ran its own loader. Each call now owns its cells, a call skipped by a condition keeps its own, and server and browser builds key them identically for SSR seeds and streamed results. Call sites are keyed in modules with a runtime signals import and for hooks named with `$`.

---
"octane": patch
---

React parity: `event.currentTarget` during delegated dispatch is now the element whose
handler is firing.

octane delegates events at the root, so the native `currentTarget` was the delegation
root — while React's synthetic system guarantees each handler sees its OWN element. Ported
React code leans on this constantly (`event.target === event.currentTarget` self-origin
guards, `currentTarget`-relative measurement, `indexOf(event.currentTarget)` in list
navigation — e.g. Radix's RovingFocusGroup). Both the bubble and capture walks now shadow
`currentTarget` per-handler (a configurable own property) and restore native semantics
after the dispatch completes.

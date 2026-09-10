---
'octane': patch
'@octanejs/mcp-server': patch
---

Reject render-time calls to known state getters from `useState`, `useReducer`, and `useLinkedState` in Strong modules, with source-located diagnostics. Keep event, effect, deferred, and compatibility-mode calls legal and document the snapshot-safe render pattern.

---
'octane': patch
'@octanejs/aria': patch
'@octanejs/cli': patch
'@octanejs/mcp-server': patch
'@octanejs/tanstack-devtools': patch
'@octanejs/tanstack-router': patch
'@octanejs/three': patch
---

Strong mode reports `OCTANE_STRONG_READ_ONLY_STATE` when a declaration takes a
`useState` value and discards its setter. Derive render values from their inputs
and use `useRef` or `useLazyRef` for values kept for events or effects. The TanStack
Devtools binding now keeps its imperative instance in a lazy ref.

---
'octane': minor
---

Add the `octane/data`, `octane/data/server` and `octane/data/react` entries: data contracts (`read`, `write`, `entity`) that accept any Standard Schema validator, a renderer-free store with shared loads, optimistic entity edits and account retirement, and a `Request`/`Response` handler that validates every call. `octane/data/react` adds `DataProvider`, `useRead`, `useReadState` and `useWrite` for React 19. See RFC #2362.

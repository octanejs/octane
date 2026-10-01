---
'octane': minor
---

Strong mode now rejects write-only state (`OCTANE_STRONG_WRITE_ONLY_STATE`): a
state tuple whose value is elided, unused, or read only to compute its own next
value, whose getter is unused, and whose setter is called or passed on. This is
the force-update pattern, including `useReducer((x) => x + 1, 0)` and
`useState(0)[1]`. It reads the external source during render and subscribes
afterwards, so a change in between is never rendered. Subscribe with
`useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` instead.
Compatibility mode is unchanged.

---
'octane': patch
---

Give `useActionState` on universal renderers the React 19 queue semantics the
DOM runtime already has. Dispatches now run one at a time, each receiving the
previous completed result as `previousState` and running the action that was
current when it was dispatched. The dispatcher keeps one identity across
renders, and `isPending` stays true until the queue drains. An action error now
reaches the nearest `universalTry` boundary (or the root's `onUncaughtError`),
keeps the prior state, and lets later queued dispatches continue. A
function-valued state is now stored rather than called.

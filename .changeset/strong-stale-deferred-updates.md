---
'octane': minor
---

Strong mode now rejects a deferred state update computed from the same state's
render snapshot (`OCTANE_STRONG_STALE_STATE_UPDATE`). After an `await`, or in a
`setTimeout`, `setInterval`, `requestAnimationFrame`, `requestIdleCallback`,
`queueMicrotask`, or promise callback, `setCount(count + 1)` can overwrite an
update that happened in between. Locals computed from the snapshot before the
`await`, copied aliases, and closures are followed. Use the updater form,
`setCount((current) => current + 1)`, or read the latest value with the state
getter. Synchronous handlers such as `onClick={() => setCount(count + 1)}`
remain valid, and so does state an Effect Event captures, because it reads the
latest committed values; a snapshot passed to it as an argument is still
checked. Compatibility mode is unchanged.

---
'octane': patch
---

Align the delegated-event commit boundary with React's `batchedUpdates`: the outermost dispatch of a discrete event now flushes synchronously only when a controlled `value`/`checked` host armed a state restore during that dispatch. Other handler updates stay in the microtask batch, so a script-dispatched event (`dispatchEvent`, `click()`, `requestSubmit()`) no longer publishes a commit mid-dispatch that React would publish after the dispatching script yields, and native listeners registered by other code observe the same pre-commit DOM under both renderers. Browser-dispatched events are unaffected in practice because the microtask checkpoint runs before the next native listener and the default action. Tests that asserted committed state immediately after a bare `dispatchEvent` should wrap the dispatch in `act()` or `flushSync()`, as with React.

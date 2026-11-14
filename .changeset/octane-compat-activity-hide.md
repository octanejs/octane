---
'octane': patch
---

`OctaneCompat` islands now disconnect under a React `<Activity mode="hidden">` the way React components do: layout and passive effects clean up, refs detach, and `useSyncExternalStore` subscriptions unsubscribe while state and DOM are kept, and the reveal reconnects them against the latest store value.

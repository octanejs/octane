---
'octane': minor
---

Add realtime feeds to `octane/data`. Declare a `feed()` whose events put or remove records, set a read's value, or invalidate tags. Serve it from `createDataHandler` with `handle(feed, …)` and `handler.listen`, and stream it through a `module server` function to a store opened with `listen: serverListener(events)`. `useFeed` in both bindings, or `listen(store, feed, params)` outside a component, shares one connection per feed and parameters while anything observes it. The store drops a duplicate event by its ID, resumes from its cursor, and reloads the reads the feed `covers` after a gap. `receive(store, changes)` applies the same changes from an app's own subscription.

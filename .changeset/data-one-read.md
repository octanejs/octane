---
'octane': patch
---

Read octane/data one way. `store.read(read, input?)` returns a handle wherever you are, and a component shows it with `useRead(handle)`, which suspends until the first value, or with `useRead(handle, { suspend: false })`, which returns the live snapshot. `useReadState` is removed: replace `useReadState(read, input)` with `useRead(useDataStore().read(read, input), { suspend: false })`, and `useRead(read, input)` with `useRead(useDataStore().read(read, input))`. `usePages` and `useFeed` take handles too: `usePages(pages(store, view, params))` and `useFeed(listen(store, feed, params))`. `store.read` accepts a read with no input, and a view, without a second argument. Both bindings, `octane/data/octane` and `octane/data/react`, change the same way.

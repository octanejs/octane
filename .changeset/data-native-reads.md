---
'octane': minor
---

`octane/data/octane` reads the store as native Octane signal reads: the renderer subscribes the component that made the read, as it does for `signal$` and `query$`, so `useRead` and `useReadState` no longer use a hook slot. Importing the binding turns on native-read collection. Store changes reach readers urgently, as `useSyncExternalStore` updates do, so a write inside `startTransition` shows its optimistic edit at once while the transition stays pending until the write settles. The store now calls its transport after the synchronous work that started a load, so a component that reads unloaded data never runs the transport, or state it updates, inside its render.

---
'octane': minor
---

`octane/data/octane` reads the store through `useSyncExternalStore` again on the client, as the server binding and React do, instead of as native signal reads. Measured on the same app, the native path was slower in every step large enough to measure. Importing the binding also turned on read collection around every component's render, including components that read no data. The client bundle is about 3 KB gzipped smaller. `useRead`, `useReadState` and `useForm` take a hook slot again, so they follow the hook rules: a call may still sit behind a condition, but not in a plain JavaScript loop.

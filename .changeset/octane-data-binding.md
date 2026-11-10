---
'octane': minor
---

Add `octane/data/octane`, the Octane binding for the data store, with the same `DataProvider`, `useRead`, `useReadState` and `useWrite` as `octane/data/react`. An Octane page and a React island given one store show the same edits and rollbacks.

`createDataHandler` now takes its options first and a function that receives a typed `handle`, so the request context types every handler: `createDataHandler({ context }, (handle) => [handle(books, (input, call) => …)])`. The standalone `handle` export is removed. A refused call now answers with HTTP 200 and `{ ok: false }`, so browsers no longer log it as a failed request. A retired store's reads stay pending without loading instead of throwing; its writes, invalidations and settlements still throw. `useRead` and `useReadState` accept a read without input.

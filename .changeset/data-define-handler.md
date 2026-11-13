---
'octane': minor
---

Add `defineHandler` to `octane/data/server`. `createDataHandler`'s `define` callback now receives it as a second argument: `defineHandler(Books, { stats: (input, call) => …, addBook: … })` serves every read, view, write and feed a module namespace exports, one function per export name, each typed as `handle` types it. A missing, misspelled or extra key is a type error, so adding a contract to the module fails to compile until the server serves it. Other exports, such as entities and schemas, are ignored. It returns the same handlers `handle` makes, so dispatch and validation are unchanged. The new `Implementation<C, T>` type names the function that serves a contract.

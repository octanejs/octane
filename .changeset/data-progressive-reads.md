---
'octane': minor
---

Add progressive reads and cursor pagination to `octane/data`.

- A transport receives a third argument, `preview(value)`, and may call it with provisional values of a read while its reply is pending. A read with no confirmed value shows the newest preview, with `preview: true` on its snapshot; the reply replaces it in one update, a failure removes it, and it is never saved, seeded or shared with other reads.
- `read({ cancel: true })` aborts a load when its last observer leaves, unless a `prefetch()` or a `refresh()` is waiting on it. Through a shared owner, a request now stops once the last tab waiting on it lets go, and previews reach every tab waiting on it.
- `pages(store, read, input, { rows, next })` reads a list whose server returns a page and a cursor. `loadMore()` joins a page already loading and retries a failed page at the same cursor; a missing or repeated cursor ends the list; `refresh()` follows the cursors again from the first page and replaces the rows once every page is confirmed.
- A pages snapshot's `value` is now the same array until a row changes.

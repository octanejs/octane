# Shelf

A reading list built on `octane/data`, rendered three ways from one set of
contracts and one server, built with Vite or with Rspack:

| Page | Renderer | Binding |
| --- | --- | --- |
| `/` | Octane (`.tsrx`), server-rendered | `octane/data/octane` |
| `/react.html` | React 19 (`.tsx`), server-rendered | `octane/data/react` |
| `/mixed.html` | Octane, hosting a React island through `ReactCompat`, browser-rendered | both, sharing one store |

The [Data guide](https://octanejs.dev/docs/data) walks through every piece used
here. The Octane and React pages differ only in their view code and binding import.
Everything else is shared:

- [`src/shared/contracts.ts`](src/shared/contracts.ts) declares the reads and
  writes with Zod schemas. Declaring them does no I/O, so the server and both
  front ends import the same module.
- [`src/shared/server.ts`](src/shared/server.ts) serves them with
  `createDataHandler`. Each write records its operation ID with its effect, so
  a lookup can say whether it landed.
- [`src/shared/data.tsrx`](src/shared/data.tsrx) exports `data`, a
  `module server` function that answers every store request, and `events`,
  which streams the shelf's changes. In the browser each is the compiler's
  stub, which calls the server; there is no data route.
- [`src/shared/session.ts`](src/shared/session.ts) opens a store per account
  over `serverTransport(data)`, injects network faults, and settles uncertain
  writes by receipt lookup. Its account cookie stands in for a sign-in.
- [`src/server/index.ts`](src/server/index.ts) answers calls to `data` and
  renders the pages, through `createServerFunctions` from
  `@octanejs/app-core/server-functions`. One middleware authenticates both. A
  page renders with its own store, whose `data` calls run in process under the
  page request's account. `store.dehydrate()` goes into the page, and the
  browser's store starts from it, so hydration loads nothing. A page also takes
  POST: `handler.forms(request, context)` runs a form's native submission, then
  redirects back to the page or renders it again with the form's issues.

## What to try

- **Load `/` or `/react.html` with JavaScript turned off.** The shelf and its
  counts are in the HTML. With JavaScript on, the Network panel stays empty
  until your first edit: hydration reuses the server's data.

- **Toggle a book.** The checkbox changes, and the book moves into or out of
  **Finished**, before the server replies. Both lists and the React island's
  list are views (`view()` in the contracts), so the store keeps each one
  sorted and complete under any edit. The Network panel shows one request: the
  write, whose reply carries the saved book for the views and the counts it
  affected.
- **Add a title already on the shelf.** The new row appears, then disappears
  when the server refuses it. The title stays in the box, with the reason
  under it.
- **Add and remove books with JavaScript turned off.** Both are native forms
  (`useForm` over a write that declares `form` fields). Each submission posts to
  the page, and the server redirects back or shows the refusal. With JavaScript
  on, the same forms submit through the store instead.
- **Lose the next reply, then add a book.** The server saves it but the reply is
  dropped. The row stays, marked as uncertain, until **Check saved result** asks
  the server. Nothing is sent twice.
- **Go offline and toggle a book.** The edit stays until a lookup, once back
  online, shows it never arrived. Then it is removed.
- **Reload `/mixed.html`.** The lists come from the store's encrypted
  IndexedDB cache (`persist` in [`session.ts`](src/shared/session.ts)), so only
  the counts, which are never fresh, load again. A real app takes the cache key
  from its signed-in session.
- **Go offline, toggle a book, then reload.** The writes are durable
  (`journal` in [`session.ts`](src/shared/session.ts)): the edit comes back
  after the reload, and a receipt lookup rolls it back, because the server
  never got it. Nothing is sent twice.
- **Switch account.** The old account's store is retired: its values clear,
  its cache is deleted, and late replies are ignored.
- **Open the same page in a second tab, then edit the shelf in one.** The
  other tab shows the change at once, counts included, and its Network panel
  stays empty: each page listens to `shelfChanges` (`useFeed`), and each event
  carries the changed book and the new counts.
- **On the mixed page, mark a book read from the React island.** The Octane list
  updates in the same moment, and a rollback reaches both.

## Commands

```bash
pnpm --filter shelf-example dev          # Vite, http://127.0.0.1:5239
pnpm --filter shelf-example dev:rspack   # Rspack, rebuilt and restarted on each change
pnpm --filter shelf-example typecheck
pnpm --filter shelf-example test:e2e     # both production builds
```

Both builds run the same server, `createShelfServer().fetch`. A small Vite
plugin in [`vite.config.ts`](vite.config.ts) mounts it: from source through
Vite's SSR loader in development, and from `dist/server` in preview.
[`rspack.mjs`](rspack.mjs) builds the pages and
[`src/server/node.ts`](src/server/node.ts), a Node server over the same
`fetch`, into `dist-rspack`.

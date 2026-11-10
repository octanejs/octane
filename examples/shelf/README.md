# Shelf

A reading list built on `octane/data`, rendered three ways from one set of
contracts and one server:

| Page | Renderer | Binding |
| --- | --- | --- |
| `/` | Octane (`.tsrx`), server-rendered | `octane/data/octane` |
| `/react.html` | React 19 (`.tsx`), server-rendered | `octane/data/react` |
| `/mixed.html` | Octane, hosting a React island through `ReactCompat`, browser-rendered | both, sharing one store |

The Octane and React pages differ only in their view code and binding import.
Everything else is shared:

- [`src/shared/contracts.ts`](src/shared/contracts.ts) declares the reads and
  writes with Zod schemas. Declaring them does no I/O, so the server and both
  front ends import the same module.
- [`src/shared/server.ts`](src/shared/server.ts) serves them with
  `createDataHandler`. Each write records its operation ID with its effect, so
  a lookup can say whether it landed.
- [`src/shared/session.ts`](src/shared/session.ts) opens a store per account,
  injects network faults, and settles uncertain writes by receipt lookup.
- [`src/server/index.ts`](src/server/index.ts) renders a page with its own
  store, which calls the data handler in process (`handler.transport(request)`)
  under the page request's account. `store.dehydrate()` goes into the page, and
  the browser's store starts from it, so hydration loads nothing.

## What to try

- **Load `/` or `/react.html` with JavaScript turned off.** The shelf and its
  counts are in the HTML. With JavaScript on, the Network panel stays empty
  until your first edit: hydration reuses the server's data.

- **Toggle a book.** The checkbox changes before the server replies. The
  Network panel shows one request: the write, with the list and the counts it
  affected returned in the same response.
- **Add a title already on the shelf.** The new row appears, then disappears
  when the server refuses it.
- **Lose the next reply, then add a book.** The server saves it but the reply is
  dropped. The row stays, marked as uncertain, until **Check saved result** asks
  the server. Nothing is sent twice.
- **Go offline and toggle a book.** The edit stays until a lookup, once back
  online, shows it never arrived. Then it is removed.
- **Switch account.** The old account's store is retired: its values clear and
  late replies are ignored.
- **On the mixed page, mark a book read from the React island.** The Octane list
  updates in the same moment, and a rollback reaches both.

## Commands

```bash
pnpm --filter shelf-example dev        # http://127.0.0.1:5239
pnpm --filter shelf-example typecheck
pnpm --filter shelf-example test:e2e   # production build and preview
```

A small Vite plugin in [`vite.config.ts`](vite.config.ts) serves `/data` and
renders the two server-rendered pages: from source through Vite's SSR loader in
development, and from `dist/server` in preview.

# Data store comparison

The comparison promised in the [reply to Ned's questions on #2362](https://github.com/octanejs/octane/issues/2362#issuecomment-6777742265).
It runs the same library journeys against two store designs and measures what
each costs and what the user sees.

- **A: cached responses.** `octane/data` as merged. Each view is a server read
  whose response is cached as sent. An edit updates every cached copy of a book
  by ID. Membership and order come from the server, so writes declare
  `invalidates: ['books']` and their replies carry every affected view back. A
  live event can only invalidate.
- **B: normalized records, queries in a worker.** A prototype. One record per
  book lives in a worker thread. Each view is a rule (`where`, `order`, a
  slice) the worker evaluates over the records, with pending edits layered on
  top. One covering read loads every book the viewer can access. A change, a
  reply or a server transaction posts one message with every view it moved.

```bash
pnpm --filter octane-data-store-comparison compare   # 2,000 and 20,000 books
SIZES=5000 pnpm --filter octane-data-store-comparison compare
```

## Method

`src/library.ts` holds a server that assigns IDs, can refuse a star, and lets
another user edit. Every response passes through `respond()`, which counts the
devalue-encoded bytes. Every network hop waits 40 ms. Six views are shown
throughout: recent (by rank), bookmarks (starred, by title), two library pages
(by title), and shelves A and B (by title), 20 rows each.

After each notification, each journey compares every view against an oracle
(`evaluate` over the intended books) and records:

- **Intended state shown:** ms from the action until every view shows what the
  user meant, including membership and order. "never" means the views only
  became right once the server settled them.
- **Settled correctly:** whether every view matches the server once the journey
  goes quiet.
- **Impossible states:** notifications that showed a forbidden state. Journey 4
  forbids a book on both shelves or on neither.
- **KB across worker:** structured-clone bytes in both directions between the UI
  and the worker (`v8.serialize`).

**Feature code** counts the non-blank lines an app writes for these screens:
the `FEATURE` block in `src/cached.ts` for A, and the view rules in
`src/library.ts` for B. B's query engine (`src/normalized/worker.ts`) is
framework code and is not counted.

## Results

Network latency per hop: 40 ms

## 2,000 books

| Journey | Design | Intended state shown (ms) | Settled correctly | Requests | KB fetched | KB across worker | Impossible states |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| 1. Add a book and star it before the create returns | A: cached responses | never | yes | 16 | 39.0 | 0.0 | 0 |
| 1. Add a book and star it before the create returns | B: normalized records, queries in a worker | 9 | yes | 4 | 0.4 | 12.7 | 0 |
| 2. Rename a starred book across a sorted list and pages | A: cached responses | 47 | yes | 8 | 19.5 | 0.0 | 0 |
| 2. Rename a starred book across a sorted list and pages | B: normalized records, queries in a worker | 5 | yes | 2 | 0.2 | 5.1 | 0 |
| 3. A star is refused after another user renames the book | A: cached responses | 47 | yes | 15 | 29.4 | 0.0 | 0 |
| 3. A star is refused after another user renames the book | B: normalized records, queries in a worker | 45 | yes | 3 | 0.4 | 2.7 | 0 |
| 4. Another user moves a book between shelves | A: cached responses | 93 | yes | 7 | 9.8 | 0.0 | 1 |
| 4. Another user moves a book between shelves | B: normalized records, queries in a worker | 46 | yes | 1 | 0.1 | 3.7 | 0 |

| 5. Cold start | First load (ms) | Requests | KB fetched | KB across worker | KB persisted | Restore (ms) | Restore requests | Restored views correct |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A: cached responses | 44 | 6 | 9.6 | 0.0 | 9.6 | 0 | 0 | yes |
| B: normalized records, queries in a worker | 77 | 1 | 177.3 | 7.5 | 177.3 | 34 | 0 | yes |

## 20,000 books

| Journey | Design | Intended state shown (ms) | Settled correctly | Requests | KB fetched | KB across worker | Impossible states |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| 1. Add a book and star it before the create returns | A: cached responses | never | yes | 16 | 39.6 | 0.0 | 0 |
| 1. Add a book and star it before the create returns | B: normalized records, queries in a worker | 51 | yes | 4 | 0.5 | 12.9 | 0 |
| 2. Rename a starred book across a sorted list and pages | A: cached responses | 73 | yes | 8 | 19.8 | 0.0 | 0 |
| 2. Rename a starred book across a sorted list and pages | B: normalized records, queries in a worker | 31 | yes | 2 | 0.2 | 5.1 | 0 |
| 3. A star is refused after another user renames the book | A: cached responses | 82 | yes | 15 | 29.8 | 0.0 | 0 |
| 3. A star is refused after another user renames the book | B: normalized records, queries in a worker | 66 | yes | 3 | 0.4 | 2.7 | 0 |
| 4. Another user moves a book between shelves | A: cached responses | 136 | yes | 7 | 9.9 | 0.0 | 1 |
| 4. Another user moves a book between shelves | B: normalized records, queries in a worker | 72 | yes | 1 | 0.1 | 3.8 | 0 |

| 5. Cold start | First load (ms) | Requests | KB fetched | KB across worker | KB persisted | Restore (ms) | Restore requests | Restored views correct |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A: cached responses | 53 | 6 | 9.8 | 0.0 | 9.8 | 0 | 0 | yes |
| B: normalized records, queries in a worker | 130 | 1 | 1900.2 | 7.6 | 1900.2 | 39 | 0 | yes |

Feature code: A 25 lines; B 8 lines.

## What the numbers say

1. **Edits look right immediately only in B.** Under A, an edit changes a
   book's fields in every cached list but cannot move it between lists.
   - Journey 1's new book appears at the end of every list until the reply
     arrives, so its intended state is never shown before the server settles
     it.
   - Journey 2's renamed book is in the wrong position for one round trip.

   B evaluates every view's rule over the edited records, so membership and
   order are right in the same task: 5 to 9 ms at 2,000 books, including the
   worker hop.
2. **A server transaction stays atomic in B, not in A.** In journey 4, A's
   live event can only invalidate. Its shelves then reload as separate reads,
   and one notification showed the moved book on both shelves. B applies the
   transaction to its records and posts both shelves in one message.
3. **A fetches less up front; B fetches less afterwards.**
   - **Up front:** B's covering read costs 177 KB at 2,000 books and 1.9 MB at
     20,000, against A's 10 KB for six views of 20 rows. B also persists that
     much.
   - **Afterwards:** every A write reloads every affected view, 20 to 39 KB per
     edit. B's edits fetch only the written record, under 1 KB.
4. **The worker boundary is cheap at this size.** B posts 3 to 13 KB per
   journey, because it sends whole changed views. Diffs would shrink that.
5. **Local evaluation grows with the library.** At 20,000 books B shows an
   intended state in 30 to 72 ms, because the prototype filters and sorts every
   record for every view on every change. Indexes on each view's order and
   filter would make that proportional to the rows that change.
6. **B needs less feature code: 8 lines against 25.** A has to know which
   writes and events move books between lists. B declares each list once.

## Recommendation

Use both, split by who defines a list.

- **Declared lists are normalized.** A list the app defines by a rule, such
  as bookmarks, shelves or library pages, is evaluated locally over shared
  records. Journeys 1, 2 and 4 show why: correct membership and order with no
  round trip, and atomic server transactions.
- **Server-defined responses stay cached as sent.** Ranked search results,
  recommendations and anything else only the server can order stay as they
  are. Those reads still share records, so a rename reaches them, but they keep
  the server's membership.
- **Coverage is declared per read.** B's 1.9 MB covering read at 20,000 books
  is the cost to avoid. A list that declares a rule should be loadable through
  a narrower covering read, such as "starred books" or "shelf A", and only fall
  back to everything when the app says that is cheap. Ned suggested this, and
  it is the next thing to measure.
- **The worker stays optional**, as in the revised summary. These numbers do
  not require one: B's evaluation cost is per change, and indexes, not a
  thread, are what keep it small.

## Limits of this comparison

- **Simulated network:** a fixed 40 ms per hop, in one Node process. There is
  no rendering cost and no browser main-thread contention.
- **A prototype engine:** B evaluates every view in full on every change and
  posts whole views, with no indexes and no diffs.
- **No revalidation on restore:** both designs show restored data without
  revalidating. A real start would revalidate. For A that means reloading each
  view; for B, a catch-up from its stored revision.
- **No persistence medium:** the comparison does not simulate IndexedDB.
  "KB persisted" is the size of the serialized data.

# Data store comparison

The comparison promised in the [reply to Ned's questions on #2362](https://github.com/octanejs/octane/issues/2362#issuecomment-6777742265).
It runs the same library journeys against three store designs and measures
what each costs and what the user sees.

- **A: cached responses.** `octane/data` as merged.
  - Each view is a server read whose response is cached as sent.
  - An edit updates every cached copy of a book by ID.
  - Membership and order come from the server, so writes declare
    `invalidates: ['books']` and their replies carry every affected view back.
  - A live event can only invalidate.
- **B: normalized, every book.** A prototype.
  - One record per book lives in a worker thread.
  - Each view is a rule (`where`, `order`, a slice) that the worker evaluates
    over the records, with pending edits layered on top.
  - One covering read loads every book the viewer can access.
  - A change, a reply or a server transaction posts one message with every
    view it moved.
- **C: normalized, view windows.** The same worker and rules as B, with less
  loaded up front.
  - Each view loads only the rows it shows plus a margin of 20 either side.
    The views share their records.
  - The worker evaluates a view only within the part of its order it holds.
  - It fetches the window again only when edits push the rows a view needs
    past that edge.

```bash
pnpm --filter octane-data-store-comparison compare   # 2,000 and 20,000 books
SIZES=5000 pnpm --filter octane-data-store-comparison compare
```

## Method

`src/library.ts` holds a server that assigns IDs, can refuse a star, and lets
another user edit. Every response passes through `respond()`, which counts the
devalue-encoded bytes. Every network hop waits 40 ms. Six views are shown
throughout, 20 rows each:

- recent, by rank;
- bookmarks, starred books by title;
- two library pages, by title;
- shelves A and B, by title.

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

Every journey edits a book the user can see in one of the six views.

**Feature code** counts the non-blank lines an app writes for these screens:
the `FEATURE` block in `src/cached.ts` for A, and the view rules in
`src/library.ts` for B and C. The query engine in `src/normalized/worker.ts` is
framework code and is not counted.

## Results

Network latency per hop: 40 ms

## 2,000 books

| Journey | Design | Intended state shown (ms) | Settled correctly | Requests | KB fetched | KB across worker | Impossible states |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| 1. Add a book and star it before the create returns | A: cached responses | never | yes | 16 | 39.0 | 0.0 | 0 |
| 1. Add a book and star it before the create returns | B: normalized, worker, every book | 8 | yes | 4 | 0.4 | 12.7 | 0 |
| 1. Add a book and star it before the create returns | C: normalized, worker, view windows | 3 | yes | 4 | 0.4 | 12.7 | 0 |
| 2. Rename a starred book across a sorted list and pages | A: cached responses | 49 | yes | 8 | 19.5 | 0.0 | 0 |
| 2. Rename a starred book across a sorted list and pages | B: normalized, worker, every book | 3 | yes | 2 | 0.2 | 5.1 | 0 |
| 2. Rename a starred book across a sorted list and pages | C: normalized, worker, view windows | 5 | yes | 2 | 0.2 | 5.1 | 0 |
| 3. A star is refused after another user renames the book | A: cached responses | 49 | yes | 15 | 29.4 | 0.0 | 0 |
| 3. A star is refused after another user renames the book | B: normalized, worker, every book | 45 | yes | 3 | 0.4 | 2.7 | 0 |
| 3. A star is refused after another user renames the book | C: normalized, worker, view windows | 42 | yes | 3 | 0.4 | 2.7 | 0 |
| 4. Another user moves a book between shelves | A: cached responses | 94 | yes | 7 | 9.8 | 0.0 | 1 |
| 4. Another user moves a book between shelves | B: normalized, worker, every book | 46 | yes | 1 | 0.1 | 3.7 | 0 |
| 4. Another user moves a book between shelves | C: normalized, worker, view windows | 45 | yes | 1 | 0.1 | 3.7 | 0 |
| 5. Rename the first book in the library so it sorts last | A: cached responses | 46 | yes | 8 | 19.4 | 0.0 | 0 |
| 5. Rename the first book in the library so it sorts last | B: normalized, worker, every book | 3 | yes | 2 | 0.2 | 3.8 | 0 |
| 5. Rename the first book in the library so it sorts last | C: normalized, worker, view windows | 4 | yes | 2 | 0.2 | 3.8 | 0 |

| 6. Cold start | First load (ms) | Requests | KB fetched | KB across worker | KB persisted | Restore (ms) | Restore requests | Restored views correct |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A: cached responses | 44 | 6 | 9.6 | 0.0 | 9.6 | 1 | 0 | yes |
| B: normalized, worker, every book | 73 | 1 | 177.3 | 7.5 | 177.4 | 26 | 0 | yes |
| C: normalized, worker, view windows | 58 | 6 | 21.2 | 7.5 | 14.5 | 23 | 0 | yes |

## 20,000 books

| Journey | Design | Intended state shown (ms) | Settled correctly | Requests | KB fetched | KB across worker | Impossible states |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| 1. Add a book and star it before the create returns | A: cached responses | never | yes | 16 | 39.6 | 0.0 | 0 |
| 1. Add a book and star it before the create returns | B: normalized, worker, every book | 46 | yes | 4 | 0.5 | 12.9 | 0 |
| 1. Add a book and star it before the create returns | C: normalized, worker, view windows | 24 | yes | 4 | 0.5 | 12.9 | 0 |
| 2. Rename a starred book across a sorted list and pages | A: cached responses | 82 | yes | 8 | 19.8 | 0.0 | 0 |
| 2. Rename a starred book across a sorted list and pages | B: normalized, worker, every book | 32 | yes | 2 | 0.2 | 5.1 | 0 |
| 2. Rename a starred book across a sorted list and pages | C: normalized, worker, view windows | 16 | yes | 2 | 0.2 | 5.1 | 0 |
| 3. A star is refused after another user renames the book | A: cached responses | 85 | yes | 15 | 29.8 | 0.0 | 0 |
| 3. A star is refused after another user renames the book | B: normalized, worker, every book | 65 | yes | 3 | 0.4 | 2.7 | 0 |
| 3. A star is refused after another user renames the book | C: normalized, worker, view windows | 57 | yes | 3 | 0.4 | 2.7 | 0 |
| 4. Another user moves a book between shelves | A: cached responses | 137 | yes | 7 | 9.9 | 0.0 | 1 |
| 4. Another user moves a book between shelves | B: normalized, worker, every book | 70 | yes | 1 | 0.1 | 3.8 | 0 |
| 4. Another user moves a book between shelves | C: normalized, worker, view windows | 56 | yes | 1 | 0.1 | 3.8 | 0 |
| 5. Rename the first book in the library so it sorts last | A: cached responses | 83 | yes | 8 | 19.8 | 0.0 | 0 |
| 5. Rename the first book in the library so it sorts last | B: normalized, worker, every book | 31 | yes | 2 | 0.2 | 3.9 | 0 |
| 5. Rename the first book in the library so it sorts last | C: normalized, worker, view windows | 20 | yes | 2 | 0.2 | 3.9 | 0 |

| 6. Cold start | First load (ms) | Requests | KB fetched | KB across worker | KB persisted | Restore (ms) | Restore requests | Restored views correct |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A: cached responses | 56 | 6 | 9.8 | 0.0 | 9.8 | 0 | 0 | yes |
| B: normalized, worker, every book | 135 | 1 | 1900.2 | 7.6 | 1900.2 | 40 | 0 | yes |
| C: normalized, worker, view windows | 63 | 6 | 21.6 | 7.6 | 15.0 | 22 | 0 | yes |

Feature code: A 30 lines; B 8 lines.

## What the numbers say

1. **Only the normalized designs show an edit correctly before the reply.**
   Under A, an edit changes a book's fields in every cached list but cannot
   move it between lists.
   - Journey 1's new book sits at the end of every list until the reply
     arrives, so A never shows the intended state before the server settles
     it.
   - In journeys 2 and 5, the renamed book is in the wrong position for one
     round trip.

   B and C evaluate each view's rule over the edited records, so membership
   and order are right in the same task.
2. **A server transaction stays atomic in B and C, not in A.** In journey 4,
   A's live event can only invalidate. Its shelves then reload as separate
   reads, and one notification showed the moved book on both shelves. B and C
   apply the transaction to their records and post both shelves in one
   message.
3. **Windows remove the first-load cost.**
   - **B:** 177 KB at 2,000 books and 1.9 MB at 20,000, because it loads every
     book.
   - **C:** 21 KB at either size, because it loads each view's rows plus the
     margins.
   - **A:** 10 KB.

   C also persists 15 KB, against A's 10 KB and B's 1.9 MB.
4. **The margin absorbed every move in these journeys.** Journey 5 moves page
   1's first book to the end of the library, and page 2's window still held
   enough rows. C would fetch past the edge only after more than 20 rows leave
   one window between refreshes.
5. **Smaller windows also make local evaluation cheaper.** At 20,000 books, C
   shows an edit in 11 to 61 ms against B's 17 to 92 ms, because it sorts
   about 170 records instead of 20,000. The prototype still evaluates every
   view on every change, with no indexes.
6. **After the first load, A pays per edit.** Every A write reloads the views
   it affects, 20 to 39 KB per edit. B and C fetch only the written record,
   under 1 KB.
7. **B and C need less feature code: 8 lines against 30.** A has to know which
   writes and events move books between lists. B and C declare each list once.

## Recommendation

Use **declared lists over shared records, loaded by window**, which is design C.

- **Declared lists are normalized.** A list the app defines by a rule, such as
  bookmarks, shelves or library pages, is evaluated locally over shared records
  within the window it holds. The result is correct membership and order with
  no round trip, and atomic server transactions.
- **Each list loads its own window plus a margin.** Nothing loads "every book"
  unless the app declares that cheap. The first load stays within about twice
  A's at any library size. Server rendering can send the same windows as the
  page's seed.
- **Server-ordered responses stay cached as sent.** Ranked search results and
  recommendations keep the server's membership, but share records with the
  declared lists, so a rename still reaches them.
- **The worker stays optional.** C's evaluation cost depends on the size of
  its windows, not on a separate thread. Indexes on each view's order and
  filter would make it proportional to the rows that change.

## Limits of this comparison

- **Simulated network:** a fixed 40 ms per hop, in one Node process. There is
  no rendering cost and no browser main-thread contention.
- **Prototype engine:** B and C evaluate every view in full on every change and
  post whole views, with no indexes and no diffs.
- **Windows can shift from below:** C assumes a move into or out of the region
  before a window's start does not shift its rows. Every window in these
  journeys starts at the top of its list. A window further down a long list
  needs a count, or a fetch, when rows cross its lower bound.
- **No revalidation on restore:** no design revalidates restored data. A real
  start would revalidate. For A that means reloading each view; for B and C, a
  catch-up from their stored revision.
- **No persistence medium:** the comparison does not simulate IndexedDB.
  "KB persisted" is the size of the serialized data.

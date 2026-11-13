# octane/data: cross-tab ownership (design)

Status: agreed 2026-11-13 (all four recommendations). Tracks #2532, phase 6
of the octane/data RFC (#2362).

## The problem today

Each tab opens its own `createDataStore`. Two tabs of one account therefore:

- load the same reads twice, and hold their own feed connections;
- each write the shared encrypted cache, with no coordination, so the budget is
  per tab and a value saved by one tab can overwrite a newer one from another;
- each recover the write journal on start, so two tabs that open together look
  up the same receipts and can both settle the same write;
- never see each other's pending edits or rollbacks until a reload or a feed
  event.

Retiring a store on sign-out clears that tab's memory and the partition, but a
second tab, or one frozen in the background, keeps showing the old account
until it is told otherwise. Nothing tells it.

## Goal

One owner per account across the tabs of compatible builds. It performs every
network request, holds every feed connection, and is the only writer of the
cache and the journal. Every tab sees the same confirmed values, the same
pending edits and the same rollbacks. A tab never shows an account's data after
that account has been retired, even if it was frozen when it happened.

## Decisions to agree

Each has a recommendation. The rest of this note assumes the recommendations.

### 1. What the owner holds: a replicated operation log (recommended)

**Recommended.** Each tab keeps a store, a *replica*, that renders exactly as
today: it evaluates views, applies optimistic projections and answers
`getSnapshot` synchronously. The owner, in a SharedWorker, holds what must be
single across tabs:

| Owner (worker) | Replica (each tab) |
| --- | --- |
| Transport: every read, write and receipt lookup | Snapshots, views, projections |
| Feed connections and their cursors | Form drafts, focus, URL state |
| The encrypted cache and its budget | Its own subscriptions |
| The write journal and recovery | Hydration from the page's seed |
| Account generation and fencing | |

A write starts in the tab, which applies its optimistic edit in the same task
as the event, as the store's contract already requires. The tab sends the
operation (ID, write name, raw input) to the owner, which journals it,
dispatches it once, and broadcasts the operation to every replica. Each replica
then applies the same projection, because every compatible build runs the same
`write` contract. Replies, refreshed reads, receipts and feed events go to
every replica that holds the affected reads. So every tab shows the same edit
before the reply and the same rollback after a refusal: the RFC's acceptance
case.

**Alternative: the owner renders the snapshots.** Tabs would hold only
snapshots the worker computed. That means a worker round trip before an
optimistic edit can show, which breaks the same-task guarantee. It also moves
view evaluation off the main thread, which would be welcome, but every input
event would then wait on the worker. Rejected for now.

This split reuses most of the store. A replica is `createDataStore` with its
`transport`, `listen` and `persist` replaced by one connection to the owner.
That connection also delivers other tabs' operations, which the store already
knows how to show, and confirmed changes through the `receive` and `publish`
paths it already has.

### 2. Sharing across builds: a stable worker, with a handshake (recommended)

A SharedWorker is shared only by pages that construct it with the same script
URL and name. A content-hashed bundle URL changes with every deploy, so two
builds would never share. And while any tab holds a SharedWorker, a new tab
connects to that *running* instance, whatever the server now serves at that
URL.

**Recommended.** The build plugins (Vite and Rsbuild/Rspack, as always) emit
the data worker at a stable path, for example `/_octane/data-worker.js`, and
the worker's name carries the protocol version and a hash of the account
partition. Every connection begins with a handshake that sends:

- the protocol version;
- a *contract identity*: a hash over each contract's name, kind, `version` and
  output schema shape, where its validator describes one. This is the same
  shape hash the persistent cache already uses to discard a value saved under
  another shape.

The owner registers the identity of the first build that connects. A tab whose
identity matches shares. A tab whose identity differs, or whose protocol is
older or newer, falls back to its own store (decision 3) and never reads the
shared one. A worker ends once no tab holds it, so after
every tab of an old build has closed, the next tab starts the newest worker
script.

**Alternative: one worker per build.** Simpler, but two tabs on different
deploys never share, which fails the RFC's first acceptance case. Use it only
if a stable URL turns out to be impossible on some host.

### 3. Fallback: a store per tab, as today (recommended)

Where `SharedWorker` is missing, construction throws, or the handshake refuses
the tab, the tab opens a full local store exactly as now. No cross-tab
guarantees, and the app code doesn't change.

**Alternative: leader election.** Web Locks plus BroadcastChannel can elect a
tab as the owner. That works without SharedWorker, but every tab stalls when
the leader is frozen in the background, and handoff mid-request is another
recovery path to build. Worth revisiting only if a host the apps need lacks
SharedWorker.

### 4. Account fencing: a durable generation (recommended)

- The owner keeps an *account decision* in IndexedDB, separately from the
  encrypted partitions: the active partition and a generation number that
  increases on every sign-in, sign-out or switch.
- Every message carries the generation it belongs to. A replica drops anything
  from another generation, and so does the owner.
- `retire()` in any tab asks the owner to advance the generation. The owner
  writes the decision durably, then tells every replica, then clears the old
  partition. Each replica clears its values when it hears.
- A tab that resumes from being frozen (`resume`, or `visibilitychange` after
  `freeze`), or whose connection was lost, is fenced first. Its reads report
  `pending`, as a retired store's already do, until it has re-handshaken and
  read the current decision. It reveals nothing it held from before.
- If the initiating tab's request to the owner times out, the tab fences itself
  and keeps retrying. A crash of the initiator or the worker leaves the durable
  decision, which the next owner reads before serving anything.

A locked device whose key provider cannot return the cache key keeps the
partition closed, exactly as the persistent cache does today.

### 5. Crashes and lost connections

- **Owner crash.** A SharedWorker's end is not reliably signalled to its ports,
  so replicas run a heartbeat. On a miss, a replica fences itself, constructs
  the worker again (the same URL and name start a new instance), and
  re-handshakes. The new owner recovers the journal and settles each write by
  its receipt, exactly as a restart does now. Nothing is sent twice.
- **Tab crash or close.** The owner drops that tab's subscriptions when its
  heartbeat stops. A write the tab submitted keeps going, because the owner
  dispatched it. A write that outlives its tab is an improvement on today.
- **Write in flight to the owner when the connection drops.** The tab doesn't
  know whether the owner journaled it. It marks the write uncertain, and
  settles it after re-handshake by asking the owner, which checks its journal,
  then the receipt. It never resends it.

### 6. Hydration and the seed

The replica hydrates from the page's seed synchronously, as now, so hydration
never waits on the worker. After hydration it subscribes its reads through the
owner. The owner answers with what it holds. A value newer than the seed's,
compared by load time (the tab and the worker share one clock), replaces it as
an ordinary update. A seed value newer than the owner's is offered to the owner,
which adopts it the way `publish` does. The seed's feed positions go to the
owner, which resumes each feed from the older of its saved cursor and the
page's.

## What this changes for apps

```ts
// src/data-worker.ts: named by the build plugins' `dataWorker` option, which
// emit it at `/_octane/data-worker.js`.
serveDataOwner({ transport: serverTransport(data), listen: serverListener(events) });

// The page. `sharedOwner` is `null` where SharedWorker is missing or refused.
const port = sharedOwner(partition);
export const store = port
  ? createReplica(port, { seed, writes: [addBook, setRead, removeBook] })
  : createDataStore({ transport, listen, persist, seed });
```

The worker and `sharedOwner` are the opt-in, and live in their own module, so
an app without them ships none of the connection code. Hooks, contracts and
handlers are untouched. The config `data` module from `@octanejs/app-core`
gains the worker entry later, so apps using it opt in with one line.

## Bundle cost

A tab that uses the owner no longer needs persistence (the crypto, the
IndexedDB adapter, budgeting) or the feed connection loop. Those move into the
worker, so the tab's bundle should shrink, not grow. The replica connection
must stay behind the `owner` option, so a store without it ships none of the
connection code. Each PR reports bytes as usual.

## Delivery

1. **Owner protocol, in process.** (Done: `createDataOwner` and
   `createReplica`, #2559.) The owner and replica over a `MessagePort`
   pair, with no SharedWorker yet: shared reads and requests, operations
   broadcast, the same rollback in two replicas, feed events fanned out.
   Tested in Node with `MessageChannel`.
2. **SharedWorker host and build output.** (Done in #2560: `sharedOwner`,
   `serveDataOwner`, and the `dataWorker` option of the Vite and Rspack
   plugins.) Shelf opens two pages and asserts one network load and one shared
   rollback, in Chromium, under both bundlers.
3. **Account fencing.** (Done in #2572: owners record the origin's account and
   generation in IndexedDB, announce it on a BroadcastChannel, and retire a
   replaced account's tabs; a sign-out never undoes a newer sign-in.) The
   durable generation, freeze and resume, and the timeout path. Browser tests freeze a page, switch accounts in another, and
   resume.
4. **Handshake, fallback and crashes.** (Done in #2583: `createReplica(owner, {
   ...localOptions, contracts })` falls back to a local store when the owner is
   `null`, refuses the build, cannot record the account, or is lost for good;
   heartbeats both ways; a lost owner is reopened and asked again, writes in
   flight become uncertain.) Contract identity, a mixed-build test
   (one compatible pair, one incompatible), worker termination and respawn,
   and journal recovery after a crash.
5. **Single-writer cache.** (Done. 5a, #2594: `serveDataOwner({ persist })`;
   a replica forwards its persistence to the owner, which keeps one cache and
   budget per account, and only the first tab recovers the journal; a tab
   keeps its own persistence only as a local store. 5b: a tab that reconnects
   after a crash settles each journaled write it shows as uncertain by its
   receipt, which the owner looks up once for every tab; a later tab's
   recovery leaves out writes still in flight; a new owner can remove a
   write an earlier one journaled.)

Each PR carries both bindings' tests and the RFC acceptance cases it closes.

## Agreed

1. Each tab keeps a replica store; the SharedWorker owner does all I/O and
   persistence and broadcasts operations (decision 1).
2. A stable worker URL with a contract-identity handshake, so compatible builds
   share (decision 2).
3. A tab that cannot share keeps its own store, as today (decision 3).
4. A pending edit shows in every tab, and so does its rollback.

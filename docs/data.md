# octane/data reference

`octane/data` is Octane's data layer for data the server owns. This page is the
reference: entry points, the store's guarantees, the wire protocol, and the
lifetimes of feeds, persistence and the cross-tab owner. For a guided
introduction with examples in `.tsrx` and React, read the
[Data guide](https://octanejs.dev/docs/data). The source in
`packages/octane/src/data/` is the specification; its module comments state
each invariant listed here.

## Entry points

| Entry | Exports | Runs |
| --- | --- | --- |
| `octane/data` | `read`, `write`, `view`, `entity`, `feed`, `DataError`; `createDataStore`, `DataUncertainError`, `DataRetiredError`; `httpTransport`, `serverTransport`, `serverListener`, `webSocketListener`, `pubSubListener`; `listen`, `receive`, `pages`; `indexedDBStorage`, `memoryStorage`, `autoBudget`; `createDataOwner`, `createReplica`, `sharedOwner`, `serveDataOwner` | Browser, server, workers. Imports no renderer and no compiler. |
| `octane/data/server` | `createDataHandler` | Server only. |
| `octane/data/octane` | `DataProvider`, `useDataStore`, `useRead`, `usePages`, `useWrite`, `useForm`, `useFeed` | Octane components. The server compiler retargets it to `octane/data/octane/server`. |
| `octane/data/react` | The same names, over React's hooks | React 19 components. Marked `'use client'`. |

Both bindings read snapshots through `useSyncExternalStore`, so a store given to
an Octane tree and a React tree (for example across `ReactCompat` or
`OctaneCompat`) shows the same values, pending edits and rollbacks in both.

## Contracts

A contract is an inert description. Declaring or importing one does no I/O.
Schemas are [Standard Schema](https://standardschema.dev) validators. A
synchronous validator validates synchronously, so a write can show its edit in
the same task as the event that caused it.

| Contract | Options | Notes |
| --- | --- | --- |
| `read` | `name`, `input?`, `output`, `entities?`, `tags?`, `fresh = 0`, `keep = 300000`, `expire = Infinity`, `persist = true`, `version = ''` | Times are milliseconds. `entities(output)` returns `Entity.from(...)` selections. |
| `write` | `name`, `input`, `output?`, one of `creates`/`patches`/`removes`, `draft?`, `serverId?`, `record?`, `form?`, `invalidates?` | `draft(input, id)` defaults to the input plus the new ID. `record(output)` locates the saved record so views take it without reloading. |
| `entity` | `name`, `schema`, `key = 'id'` | `id(value)` is `String(value[key])`. |
| `view` | `name`, `of`, `order`, `where?`, `input?`, `limit = 20`, `max = 500`, plus the read options | A read whose input is `{ ...params, offset, limit }` and whose value is that window's rows. `view.view.where` and `view.view.compare` are exposed for handlers. |
| `feed` | `name`, `params?`, `event`, `changes(event, params)`, `covers` | `changes` returns `{ put, value }`, `{ remove, id }`, `{ read, input?, value }` or `{ invalidates }`, or an array of them. |

`view` ordering compares values as JavaScript's `<` does (dates by time,
`null`/`undefined` first), then by the entity key. A handler must serve the
same order.

## Store guarantees

`createDataStore({ transport, seed?, seedAge?, form?, persist?, listen?, feeds? })`.

- Describing or snapshotting a read does no network work. Subscribing,
  prefetching and refreshing start a load; readers of one entry share it.
  Inputs are compared by value.
- `getSnapshot()` is stable between changes. A snapshot is
  `{ status, value, error, refreshing, stale, more }`; `value` is the newest
  confirmed value with pending edits applied.
- A write is sent once. A transport rejection after dispatch leaves it
  uncertain (`DataUncertainError`), with its edit shown, until
  `settle(operationId, confirmed, value?)` names the outcome.
- Only a reply for an entry's current attempt, in a store that has not been
  retired, changes confirmed state.
- Writes to a record whose create is unconfirmed wait for it. They are refused
  unsent if it is refused, and carry the server's ID if `serverId` assigned one.
- Every value one reply carries is adopted before any reader is notified.
- Every optimistic edit is an absolute patch, an insert by ID or a delete by
  ID, so it replays over any newer value without counting twice.
- A view's records are shared: one table per entity holds the newest confirmed
  copy of each record any view loaded, and every view of the entity is
  evaluated over it with outstanding edits applied. The store loads a margin
  beyond the visible window.
- A seed is adopted when its read is first asked for, and keeps its age
  (`seedAge` adds time spent in a cache).
- `retire()` clears memory at once, ignores late replies, and resolves once
  persistent storage is cleared. Later writes, invalidations and settlements
  throw `DataRetiredError`; later reads stay pending without loading.
- `dehydrate()` returns text safe inside `<script type="application/json">`.
  Call it on a server store after the render completes, then retire the store.

## Wire protocol

Transports and handlers exchange devalue-encoded messages, so dates, maps and
sets survive.

```ts
interface DataRequest {
	kind: 'read' | 'write' | 'position';
	name: string;
	input: unknown;
	operationId?: string; // writes
	refresh?: Array<{ name: string; input: unknown }>; // reads on screen a write asks back
}

type DataReply =
	| { ok: true; value: unknown; refreshed?: Array<{ name: string; input: unknown; value: unknown }> }
	| { ok: false; code: string; data?: unknown; issues?: SchemaIssue[] };

type Transport = (request: DataRequest, signal: AbortSignal) => Promise<DataReply>;
```

A resolved reply is definitive. A rejection means the outcome is unknown. A
write may ask for at most eight reads back; the rest reload on their own.
`httpTransport` rejects any response that is not a reply, such as a proxy's
error page.

Feeds use a `Listener`, `(request: { name, params, cursor }, signal) =>
AsyncIterable<FeedFrame>`, where a frame is `{ event?, id?, cursor?, gap? }`.
An empty frame says the connection is open.

## Handler

`createDataHandler(options, define)` from `octane/data/server`:

| Option | Meaning |
| --- | --- |
| `context(request, caller?)` | Authenticates a request and returns what handlers receive. `caller.viewer` and `caller.platform` come from server-function or middleware context. |
| `allowedOrigins` | Origins other than the request's own that may call. Requests with no `Origin` are allowed. |
| `secret` | Signs form tokens. Required for `forms()`. |
| `grant(context)` | The account a request acts for; a form signed for one account is refused for another. |

`define(handle)` returns `handle(contract, run)` entries; names must be
unique. `run(input, call)` receives validated input and `call`: the context
plus `request`, `signal`, `operationId` and `read(contract, input)`. A view's
`run` receives `{ ...params, offset, limit }`. A feed's `run` is an async
iterable of frames and receives `call.cursor`. Throw `DataError(code, data?)`
to refuse.

The returned `DataServer` is a `(Request) => Promise<Response>` function with:

- `transport(request)`: an in-process transport for a server render of
  `request`.
- `serve(request, call)`: answers one request sent by `serverTransport`
  through a `module server` function.
- `listen(request, call)`: answers one feed connection sent by
  `serverListener`. Connections end after 25 seconds; the store reconnects
  from its cursor.
- `accept(socket, request, caller?)`: serves `webSocketListener` sockets with
  no time limit. Cross-origin sockets are refused.
- `forms(request, caller?)`: signs a page's forms and runs a native form POST.
  Returns `{ response, status, form }`: send `response` (a 303) when set,
  otherwise render with `status` and pass `form` to the page store.

## Forms

A write with `form` accepts native POSTs. Field codecs: `text`, `secret`
(never echoed back after a refusal), `number`, `boolean` (`"true"`/`"false"`),
`checkbox` (present or absent). Every declared field except a checkbox must
appear exactly once, and undeclared fields are refused. Field names starting
with `$` are reserved for the hidden fields that name the write, the form key,
the signed token and the operation.

`store.form(write, key?)` and `useForm` expose `pending`, `values`, `issues`
(first message per field; whole-input under `''`), `error` (a refusal code or
`'uncertain'`), `hidden(values?)` and `submit(eventOrFormData)`. The binding
view adds `attrs`, `{ method: 'post', onSubmit }`, which submits through the
store once hydrated. Only the newest submission's outcome is shown.

## Feeds

- One connection per store, feed and parameters, open while observed and
  closed when the last observer leaves or the store retires.
- Frames apply in order. Event IDs seen recently (256 per feed) apply once.
- The store resumes from the last cursor, which a persistent store saves with
  the values it covers. On a gap frame, an event that fails validation, or a
  cursorless connection returning after a live one dropped, every read in
  `covers` is marked stale.
- Failed connections retry with growing, jittered delays up to 30 seconds.
- A store with `feeds` and no `listen` (a server render's) asks each feed for
  its position before its first read; the seed carries it. A feed handler that
  can resume yields its position first when `call.cursor` is null.
- `receive(store, changes)` applies changes without validation.

## Persistence

`persist: { storage, partition, key, budget?, journal? }`.

- Values are encrypted with a key derived from `key` (at least 128 random
  bits, or an HKDF `CryptoKey` with `deriveKey` usage), and every name the
  storage sees is a keyed hash.
- Only confirmed values are saved. Values saved under another output schema
  shape or `version` are discarded unread; values that fail validation on
  restore are discarded.
- Stale marks survive restarts: each tag and entity keeps when it was last
  marked.
- Saves coalesce into one storage transaction per host task.
- After each save the partition is trimmed to 90% of `budget`, expired values
  first, then least recently used; values a mounted component shows are kept.
  `autoBudget(device)` is 1 MB at ≤2 GB memory, 2 MB to 4 GB or when hidden,
  5 MB above, halved under data saver, capped at 1% of the quota.
- `journal: { writes, receipt }` saves each listed write before sending it.
  After a restart its edit shows again and `receipt({ operationId })` decides
  it; it is never resent. Undeclared or incompatible journal entries are kept
  30 days for a compatible build.
- `PersistentStorage` is `index`, `get`, `commit`, `clear`; it only receives
  hashed names and encrypted values.

## Cross-tab owner

- `createDataOwner({ transport, listen? })` makes every request and holds every
  feed connection for its replicas; `connect(port)` serves one.
- `createReplica(owner, { ...storeOptions, contracts })` takes an ordinary
  store's options plus `contracts`, every read, write and feed the app uses.
  It renders, evaluates views and shows its own edits in the same task. It
  carries on as a local store, with its own `transport`, `listen` and
  `persist`, when `owner` is `null`, the owner refuses its build, cannot record
  the account, or is lost and cannot be reopened.
- The owner sends each write once. Other replicas show it from the moment it is
  sent and settle it the same way. Equal reads in flight are one request,
  except a replica's reload never joins a request that may predate it. One
  upstream connection serves every replica listening to a feed with the same
  parameters.
- `serveDataOwner(options)` is the data worker module's entry. The `dataWorker`
  option of `octane()` from `octane/compiler/vite` and of
  `OctaneRspackPlugin` emits it at `/_octane/data-worker.js`.
  `sharedOwner(name, url?)` returns that SharedWorker's port, named by protocol
  version and `name`, or `null` where SharedWorker is unavailable.
- `createDataOwner({ fence: true })`, which `serveDataOwner` always sets,
  fences accounts. The origin has one account at a time, recorded in IndexedDB
  (`octane-data-account`) with a generation that increases on every sign-in
  and sign-out, durably before any replica hears of it, and announced on the
  `octane-data:account` `BroadcastChannel`. `sharedOwner(account)` opens with a
  `hello` naming the account. A different account signing in retires every
  replica of the old one: values clear, pending requests reject with
  `DataRetiredError`, feeds end, and nothing in flight reaches a replica.
- `retire()` on a replica signs its account out in every tab and repeats the
  request every 5 seconds until the owner confirms. A sign-out records only if
  its generation is still current, so it never undoes a newer sign-in.
- A replica's reads show pending while its page is frozen. On `resume` it asks
  the owner, and shows them again only once the account is confirmed.
- A tab's `hello` carries its contract identity: each contract's kind, name,
  `version` and output schema shape. The first build served sets the owner's;
  a tab of another build is refused and carries on as a local store.
- Tabs and owners check on each other every 5 seconds; three silent intervals
  mean gone. A tab whose owner is gone fences its reads, reopens the worker,
  asks the new owner every read the old one never answered, and rejects writes
  that were in flight as uncertain, never resending them. An owner drops a
  silent tab's feed subscriptions; its writes keep going.
- While a replica is fenced, `prefetch` waits for the fence to lift, so a
  suspended reader shows the confirmed value rather than none.
- The owner protocol version (3) is part of the worker's name, so tabs on
  another protocol never share an owner.
- The owner does not persist yet; a replica given `persist` keeps its own
  cache and journal, as a local store does.

## Errors

| Error | Meaning |
| --- | --- |
| `DataError` | Definitive refusal. `code`; `data`; `issues` for validation (`code === 'invalid'`). |
| `DataUncertainError` | A write's outcome is unknown. `operationId` identifies it for `settle`. |
| `DataRetiredError` | The store was retired. |

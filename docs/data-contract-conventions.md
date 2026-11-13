# octane/data: a checked convention for contracts (design)

Status: proposal, for review. Nothing here is implemented. It assumes reads go
one way, `useRead(store.read(contract, input))`, with `useReadState` removed
(branch `feat/data-one-read`).

## The problem

`octane/data` is deliberately low level. A contract is a plain object, a store
method takes any contract, and nothing stops an app from building a contract
in a function, choosing one at runtime, or passing it through helpers. That
flexibility is right for the API. It also means nothing can answer simple
questions about an app without running it:

- Which writes does this app make, and where?
- Does every read, write and feed the browser uses have a server handler?
- Is any contract declared and never used?
- Is the list passed to `createReplica` complete?

Today the app answers these by hand. `examples/shelf/src/shared/session.ts`
keeps two lists in step with `contracts.ts`:

```ts
/** Every contract the pages use, so the data worker can tell this build from another deploy's. */
const contracts = [books, finished, unread, stats, receipt, addBook, setRead, removeBook, shelfChanges];
// …
journal: { writes: [addBook, setRead, removeBook], receipt },
```

A missing entry fails quietly, not loudly:

- A write missing from `createReplica`'s `contracts` is never shown across
  tabs. `follow` in `owner.ts` looks the write up by name and returns when it
  is absent. The write still works in the tab that made it.
- The same omission weakens `contractIdentity`. Two builds that differ only in
  a contract neither lists look compatible, and share an owner.
- A write missing from `journal.writes` is not saved before it is sent. It is
  lost on reload, though every other write survives.
- A contract with no `handle(…)` in `createDataHandler` fails only when it is
  requested, with `not_found`.

The user's own framing: keep passing contracts to `store.write`, but adopt a
convention, like the signals' `$`, strict enough that the compiler can find
every write, and limit misuse quickly.

## Goal

An application that opts in can be analysed statically. The compiler finds
every contract declaration and every place one is used, then:

1. rejects any use it cannot follow, at the line that breaks the rule;
2. generates the lists apps maintain by hand today;
3. reports unhandled, unused and duplicate contracts at build time.

The `octane/data` API is unchanged. The convention restricts application code
that opts in, not the library.

## Recommendation in one paragraph

Declare contracts only in `*.data.ts` modules, as exported module-level
`const`s initialised by a direct call to `entity`, `read`, `view`, `write` or
`feed` from `octane/data`, with a string-literal `name`. Everywhere else, a
contract appears only as a direct reference to that binding, at a known site
such as `store.write(setRead, …)`. Use no naming sigil: the import provenance
and the call site are the marker, as they already are for signals. A
separate opt-in check enforces this in the Vite and Rspack plugins, not Strong
mode, because React-hosted `.tsx` code uses `octane/data` too. The plugins
then serve a generated `octane/data/manifest` with `contracts`, `writes` and a
build `identity`.

## Is a sigil needed?

Signals use a `$` suffix, but the suffix is not what the compiler trusts. The
signals guide says so directly: "A type-only import or a name ending in `$`
alone does not enable these reads." `signal-declarations.js` recognises a
signal by its factory import from `octane/signals`. The `$` is for people: it
marks a handle that must be read with `.get()`, which nothing else at the use
site would show.

A contract needs no such reminder, because every use already names it in a
fixed position: `store.write(setRead, …)`, `useForm(addBook)`,
`handle(books, …)`. Compared:

| Marker | For | Against |
| --- | --- | --- |
| `$` suffix (`setRead$`) | Familiar from signals | Taken: it would mean "signal" in one module and "contract" in another, and a contract is not read with `.get()` |
| `_` prefix or suffix | The only other ASCII identifier character | Conventionally means private or unused; reads as noise |
| PascalCase (`SetRead`) | Already used for entities (`Book`) | Collides with components and types, which share the namespace |
| **Declaration and call shape** | Already present in every app; the compiler needs import provenance anyway | Needs the rules below to forbid indirect uses |

**Recommendation: no sigil.** The rules below make the declaration and call
shape a sufficient marker. Entities keep their PascalCase convention because
an entity is a type-like thing, not because the checker needs it.

## The rules

Each rule has a proposed diagnostic code. A **contract binding** is a `const`
declared by rule 1, or an import of one.

### 1. Declaration: `OCTANE_DATA_CONTRACT_DECLARATION`

A call to `entity`, `read`, `view`, `write` or `feed` imported from
`octane/data` must:

- be the entire initializer of a module-level `const`;
- be in a `*.data.ts` module (rule 2);
- be exported, directly or by a later `export { … }`;
- pass a string literal `name` (or, for `entity`, a literal first argument).

Rejected: a contract built in a function, chosen by a condition, spread from
another object, re-exported under a computed name, or named by a template
literal or variable. A `name` must be unique across the application. Today the
runtime catches a duplicate only when two handlers share it, and two contracts
with one name share a cache key and a wire name.

### 2. Contract modules: `OCTANE_DATA_CONTRACT_MODULE`

Contracts live in modules whose file name ends in `.data.ts` (or `.data.js`).
A contract module is imported by the browser and the server alike, so it must
stay inert. Its top level may contain only:

- imports, except from `octane/data/server`, `octane/server` or a module with
  a `module server` block;
- type and interface declarations;
- `const` declarations and exports.

Statements such as calls, assignments and `if` at the top level are rejected.
Calls inside an initializer, such as `z.object(…)`, stay allowed: schema
builders are calls, and the rule is about statements that run for effect.

The file suffix earns its place for one reason: **the set of contract modules
is known without walking the import graph.** A dev server compiles modules
only when they are requested, so a lazily loaded route's contracts are
unknown until someone visits it. A suffix lets the plugin find every contract
module with one glob, in dev and in a build alike. It also gives a reviewer
one place to look for wire-format changes.

### 3. Use sites: `OCTANE_DATA_CONTRACT_ARGUMENT`

At each **contract site**, the contract argument must be a contract binding,
written directly: `setRead`, or a namespace member such as
`contracts.setRead`. The sites are:

| Site | Contract position |
| --- | --- |
| `store.read`, `store.prefetch`, `store.publish`, `store.forget` | first argument |
| `store.write`, `store.form` | first argument |
| `useWrite`, `useForm` (both bindings) | first argument |
| `pages(store, view)`, `listen(store, feed)` | second argument |
| `handle(contract, run)` in `createDataHandler`, `call.read(read, input)` in a handler | first argument |
| `view({ of })`, `write({ creates, patches, removes })` | that property |
| a `FeedChange`'s `put`, `remove` or `read` | that property |

The checker matches a site by the method or import name and the contract
argument, never by the receiver. It does not need to prove that `session.store`
is a `DataStore`: a contract binding in the first argument of a `.write(…)`
call is a write site.

Rejected: a parameter, a variable assigned from a contract, a conditional
(`flag ? addBook : setRead`), or a computed member (`contracts[name]`).

One bounded form is allowed, because a handler for several views of one entity
is common: the parameter of a `.map` or `for…of` over an **inline array
literal of contract bindings** stands for exactly those bindings. Shelf's
handler already does this for its three views.

### 4. No escapes: `OCTANE_DATA_CONTRACT_ESCAPE`

A contract binding may appear only:

- at a contract site (rule 3);
- in an inline array literal used by rule 3's loop form;
- in an `import`, `export`, or type position (`typeof setRead`);
- as the object of a property read (`books.view.compare`, `setRead.name`).

Any other use, such as passing `setRead` to an app helper or storing it in a
map, is reported. This is the rule that makes the analysis complete: once a
contract cannot escape, its every use is a site the checker reads. A helper
that should take any write can declare a `Write<I, O>` parameter. Rule 3
reports its call, `store.write(write, …)`, and the code moves into a module
that does not opt in, or the helper takes a callback instead, as shelf's
`submit(session, (store) => store.write(setRead, …))` already does.

## What static knowledge buys

### A generated manifest

The plugins serve a module, `octane/data/manifest`, built from the contract
modules:

```ts
export const contracts: readonly Contract[]; // every read, view, write and feed, in name order
export const writes: readonly Write<any, any>[]; // every write
export const identity: string; // a build hash, below
```

`octane/data` ships a stub at that path whose import throws: "octane/data/manifest
is generated by the Octane Vite or Rspack plugin". A toolchain without the
plugin then fails at the import, not with an empty list.

Cost: whichever module imports the manifest imports every contract module,
with its schemas. `createReplica` already needs every write's input schema to
follow other tabs' writes, so an app that shares an owner pays this today. An
app that does not can keep its own lists, since the manifest is only used if it
is imported. In dev, adding or removing a contract module invalidates the
manifest's importers.

### Handler coverage

The plugin knows every `handle(contract, …)` inside a `createDataHandler`
call, and every contract the browser uses. A read, view, write or feed with a
browser use site and no handler is a build error,
`OCTANE_DATA_CONTRACT_UNHANDLED`, instead of a `not_found` at request time.

An app with more than one data server, such as one per service, handles each
contract in exactly one of them; a contract handled twice is reported too.

### Unused and duplicate contracts

- A declared contract with no use site is reported as a hint,
  `OCTANE_DATA_CONTRACT_UNUSED`, so dead wire surface is visible.
- Two contracts with one `name` are an error (rule 1).

### Identity for cross-tab sharing

`contractIdentity` in `owner.ts` hashes each contract's kind, name, version
and output schema shape, at runtime, over the list the app passes. With the
manifest, the list is complete by construction, which closes the silent gaps
listed above.

The build could go further and hash each contract's declaration source, so a
changed `where`, `order` or `draft` changes the identity without a manual
`version` bump. That is safe for the owner handshake: a mismatch only means a
tab runs its own store. It is not proposed for persisted values, where a
cosmetic edit would discard every user's cache. `version` stays the manual
control there.

## Enforcement

### Option A: Strong-mode diagnostics

Add a `data` section to `packages/octane/src/compiler/strong-diagnostics.js`,
with recipes, so the rules render into `docs/strong-compiler-checks.md`, the
website and `octane explain`, and are tested by the catalog test.

Against it:

- Strong compiles `.tsrx`, `.ts` and `.js` only, and reports
  `OCTANE_STRONG_TSX_MODULE` for `.tsx`. Shelf's React front end
  (`src/react/*.tsx`) uses `octane/data/react`; it would be unchecked, and the
  manifest would miss its uses.
- Strong is about rendering correctness. A module that uses contracts is not
  necessarily a module that should opt into Strong's effect and render rules.
- Strong checks one module at a time. Coverage, unused and duplicate
  contracts need the whole program.

### Option B: a separate data check (recommended)

A `data: true` option on the Octane Vite and Rspack plugins, on by default
once the app imports `octane/data/manifest`.

- **Per module**, in the plugin's transform, for any module whose source
  mentions `octane/data`: parse once with the compiler's existing parser and
  report rules 1–4. The analysis lives in one compiler module, for example
  `packages/octane/src/compiler/data-contracts.js`, which returns the
  module's declarations, use sites and diagnostics. It runs on `.ts`, `.tsx`,
  `.js` and `.tsrx`, whichever binding the module uses.
- **Whole program**, in the plugin: collect each module's facts. At build
  end, report coverage, unused and duplicate contracts, and emit the manifest
  from the `*.data.ts` glob. In dev, report them as warnings in the overlay,
  since a dev server never sees the whole program at once.
- **Parity**: both plugins call the same compiler module and differ only in
  how they glob, watch and emit a virtual module (Vite's `resolveId`/`load`;
  Rspack's virtual module with the glob's directories as context
  dependencies). One fixture app, built by both plugins, must produce the same
  diagnostics and the same manifest.
- **CLI**: `octane analyze` runs the same whole-program pass, so CI can check
  an app without building it.

The codes still get catalog entries and generated docs. If Strong later
compiles `.tsx`, Strong can turn the data check on as well, without new rules.

## The escape hatch

- The `octane/data` API is unchanged. Libraries, tests and modules that do not
  opt in may build contracts at runtime, pass them through helpers, and list
  them by hand, as today.
- The check applies only to application modules the plugin compiles.
  Dependencies keep their own mode, as they do under Strong.
- A hand-written `contracts` list and `journal.writes` remain valid in an
  opted-in app. The manifest replaces them only where the app imports it.
- **Open question:** a per-line opt-out, such as a comment that allows one
  escape. Strong has none today. Without one, the remedy is to move the code
  into a module outside the check, which keeps escapes greppable by file.

## Shelf, before and after

### Contracts

`src/shared/contracts.ts` becomes `src/shared/shelf.data.ts`, unchanged
inside: every contract is already an exported module-level `const` with a
literal name. (Shelf's `data.tsrx`, the server function module, does not
match `*.data.ts`; renaming it `endpoint.tsrx` would still avoid confusion.)

### Session

Before:

```ts
import { addBook, books, finished, receipt, removeBook, setRead, shelfChanges, stats, unread } from './contracts.ts';

const contracts = [books, finished, unread, stats, receipt, addBook, setRead, removeBook, shelfChanges];
// …
journal: { writes: [addBook, setRead, removeBook], receipt },
// …
createReplica(sharedOwner(partition), { transport, seed, persist, listen, contracts })
```

After:

```ts
import { contracts, writes } from 'octane/data/manifest';
import { receipt } from './shelf.data.ts';

// …
journal: { writes, receipt },
// …
createReplica(sharedOwner(partition), { transport, seed, persist, listen, contracts })
```

A new write is journaled and followed across tabs with no edit here.

### Server handler

Shelf's handler already passes. Its view handlers use rule 3's loop form:

```ts
...[books, finished, unread].map((list) =>
	handle(list, async (input, { shelf }) => /* list.view.where, list.view.compare */),
),
```

Delete `handle(stats, …)` and the build reports:

```
OCTANE_DATA_CONTRACT_UNHANDLED: read "books.stats" (stats, src/shared/shelf.data.ts)
is read in src/octane/App.tsrx and src/react/App.tsx but no createDataHandler handles it.
```

### Components

Unchanged. Every site already names its contract:

```tsrx
const counts = useRead(useDataStore().read(stats));
const add = useForm(addBook);
submit(session, (store) => store.write(setRead, { id: book.id, read: !book.read }));
```

What the check rejects, and why:

```ts
// OCTANE_DATA_CONTRACT_ARGUMENT: the write depends on a runtime value.
store.write(book.read ? markUnread : markRead, { id: book.id });
// Instead: one write whose input carries the value, as setRead does.

// OCTANE_DATA_CONTRACT_ESCAPE: setRead leaves the analysis through a helper.
const toggle = makeToggle(setRead);
// Instead: pass a callback that names the contract.

// OCTANE_DATA_CONTRACT_DECLARATION: built at runtime, with a computed name.
export const byShelf = (id: string) => read({ name: `shelf.${id}`, output });
// Instead: one read with an input, `input: z.object({ id: z.string() })`.
```

## Decisions to make

1. **Sigil or shape.** Recommended: shape, with no sigil.
2. **Contract modules.** Recommended: the `*.data.ts` suffix. Alternatives: a
   configured glob (more flexible, one more option), or any module, with the
   manifest built from the import graph (no rename, but incomplete in dev).
3. **Enforcement.** Recommended: Option B, a separate plugin check shared by
   Vite and Rspack, with catalog entries and `octane analyze` support.
   Alternative: Option A, Strong diagnostics, which leaves `.tsx` unchecked.
4. **Manifest contents.** Recommended: `contracts`, `writes`, `identity`.
   Open: whether `identity` hashes declaration source or keeps the runtime
   shape hash.
5. **Escapes.** Recommended: none per line at first; a module outside the
   check is the escape.

After the choices, implementation is three steps: the per-module analysis and
rules 1–4 with catalog entries; the whole-program pass and manifest in both
plugins; shelf and the data guide moved to the convention.

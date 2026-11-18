# Data on signals

Whether `octane/data` should keep its values in signals, measured two ways.

`data-bindings` asks what the shipped binding costs next to a bare
`useSyncExternalStore`, with 5,000 flat rows that each render on every change.
This suite asks what the same reads cost as signal cells, in the shapes where a
signal read differs from a hook: a component that reads several records, many
components that each show one field of a shared value, changes that arrive many
at a time, and an application that already uses signals elsewhere.

## Reader side: `run.mjs`

Production builds of Octane in Chromium. Each page mounts one scenario's rows,
then times four steps, each one synchronous: **mount**, **rerender** (a new
parent prop reaches every row), **write** (`writes` separately flushed
`receive` calls, each changing `perWrite` reads) and **unmount**. It also
reports the heap the mounted rows hold.

| Scenario | Rows | What a row reads |
| --- | ---: | --- |
| `rows` | 5,000 | Its own record. 100 writes of one record. |
| `multi` | 1,250 | Four records. 100 writes of one record. |
| `field` | 5,000 | One shared list, showing its own entry. 20 writes of one entry. |
| `stream` | 1,000 | Its own record. 20 writes of 100 records each. |
| `none` | 5,000 | Nothing. |

| Lane | How a row reads |
| --- | --- |
| `hooks` | `useRead(useDataStore().read(...))`, the shipped binding. |
| `hooks-on` | The same rows, after a module that reads signals has loaded, so the renderer collects native reads around every component render. This is the shipped binding in an application that uses signals anywhere. |
| `hooks-list` | `field` only. One component reads the list and gives each entry to a `memo` row. |
| `cells` | Each read is a signal cell, read with `.get()` while rendering. |
| `bound` | Each read is a signal cell, and the field shown is a `derived$` bound to its text node, so a write renders no component. |

### `shell`: data read near the top of the tree

The scenarios above read data at the leaves. `shell` reads it where an
application shell does: one viewer, the viewer's settings, an unread count and
200 conversations, over a 100-message thread whose every row shows the
`compact` setting. Its steps are **mount**, then four write steps of 200
separately flushed changes each: **badge** (the unread count), **rename** (the
viewer's name), **title** (one conversation's title in the list) and
**setting** (toggle `compact`), then **unmount**.

| Lane | How the shell reads |
| --- | --- |
| `hooks-top` | The shell reads all four with `useRead` and passes the values down to plain components, as a top-level provider does. Every write renders the whole shell. |
| `hooks` | The header, sidebar and thread each read what they show, over `memo` rows. |
| `cells` | The `hooks` shell, reading each signal with `.get()` while rendering. |
| `bound` | Each shown value is a `derived$` bound to its text or attribute: the header's name and count, a title per sidebar row, and one class for every thread row. The sidebar renders again only when the conversations' ids change. |

Between steps the runner waits a frame and a task, so the passive effect in
which a read subscribes has run before the next write, as it would have in a
page.

The signal lanes read a prototype, `cells.ts`: each store read mirrored into a
cell of one data scope. A store built on signals would hold its values in those
cells; the mirror keeps the store's copy as well and forwards each notification
with one `set`, which the signal lanes pay for.

Every step checks the row count and the written row's text in the same task.
Row renders are reported per lane rather than required to match: rendering
fewer components is what the `bound` lane is for. Reads are kept for the
session (`keep: Infinity`), so no lane starts retention timers on unmount.

```bash
node benchmarks/data-signals/run.mjs                 # 6 rounds × 15 iterations
node benchmarks/data-signals/run.mjs --quick         # 2 rounds × 5 iterations
node benchmarks/data-signals/run.mjs 4 --only=rows,field --no-build
```

Each round opens every case in a fresh page, in alternating order, and records
the median of its iterations. The tables report the median of the round
medians, each lane's ratio to `hooks`, and the range of that ratio across
rounds. `BENCH_JSON=<file>` also writes them as JSON.

`profile.mjs` CPU-profiles one step of one case in an unminified build and
prints the functions with the most self time:

```bash
node benchmarks/data-signals/profile.mjs rows bound unmount
```

The browser is driven over the DevTools protocol, which makes V8 capture a
detailed stack for every `Error` it constructs. A step that constructs errors
is slower here than in a page with no DevTools attached.

## Store side: `store-side.mjs`

What one change costs the store itself, in Node, with 1,000, 5,000 and 20,000
reads held and observed, and no renderer:

- **receive a read**: `receive(store, [{ read, input, value }])`;
- **receive a record**: `receive(store, [{ put, value }])`;
- **optimistic write**: the synchronous part of `store.write(...)`, up to the
  point its edit shows. The transport refuses every write, so each edit rolls
  back, untimed, before the next: a confirmed patch reloads every held read of
  its entity.

The shipped store is timed against a model of the same data as a signal graph:
per record a confirmed cell and a pending-edit cell, a derived cell showing one
over the other, and per read a derived cell over the record it selects. Both
must show the new value in the same task and notify the changed read's
observer. The model has no validation, persistence, loading or views, which the
timed operations do not use; it shows how the work grows with the reads held,
not what a finished store would cost.

```bash
node benchmarks/data-signals/store-side.mjs
node benchmarks/data-signals/store-side.mjs --quick
```

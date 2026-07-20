---
title: Inside TanStack Table V9 Reactivity
published: 2026-07-19
excerpt: TanStack Table V9 moves state and options behind reactive primitives so updates stay within the scopes that consume them. Here is the path we took to get there.
library: table
authors:
  - Riccardo Perra
---

![TanStack Table V9 - Reactivity](/blog-assets/tanstack-table-v9-reactivity/header.png)

You might have found yourself in a situation where a data grid may have started as just a simple table, but then it slowly became a small application surface in and of itself. One column renders a row-selection widget, another renders an inline editor, and a toolbar above the table shows how many rows are selected. When row selection changes, the selection widget and the counter need to update, while the other cells, editors, and pagination controls should not re-render just because one row became selected. Throw in features like search or especially column resizing, and you will find yourself in a situation where rendering performance really starts to matter.

## Rethinking Reactivity for Table V9

That rendering problem sits behind much of the recent TanStack Table V9 reactivity work. TanStack Table, along with an increasingly higher number of other TanStack libraries, challenges itself with having adapters for as many JavaScript frameworks as possible. Table V9 is shipping with a [record 9 dedicated framework adapters](https://tanstack.com/table/latest/docs/framework) so far, plus improved support for using it with no framework adapter at all in vanilla JavaScript. We have had to iterate multiple times during the development of Table V9 to get this correct — both in being performant and easy to maintain.

TanStack Table was first built with just React in mind during the early years of this library, back when it was just called [react-table](https://www.npmjs.com/package/react-table). A lot of those state management and rendering pattern assumptions stuck around in the library's core, all the way through the vanilla JS rewrite of table-core in Table V8. The primary purpose of a headless library like TanStack Table is to provide the correct state management core, but we needed to rethink how much of the core library worked under the hood and connected to each framework's reactive model.

The broader [TanStack Table V9: Taking Form](https://tanstack.com/blog/tanstack-table-v9-taking-form) announcement introduced the new state management and rendering controls. Table V9 keeps most of the same public method calls while moving state and options into a reactive graph that each adapter can connect to its framework.

Users should not have to understand that graph in order to build a table. Even though TanStack Table is headless, one of our requirements for Table V9 was that it fit naturally into each framework's reactive model. The complexity of translating between the framework-agnostic core and each rendering model belongs inside the TanStack Table library, not in your application code.

## TL;DR: Where Table V9 Landed

A Table computation should react to the state it actually reads. Selecting a row should update its checkbox and the selected-row counter without forcing every cell to depend on the entire table state.

TanStack Table V9 gets there by representing each feature-state slice (pagination, row selection, column sizing, filters, and others) with its own reactive atom, while `table.store` derives the aggregated state view for compatibility.

The core reactivity depends on a small shared atom contract provided by @tanstack/store:

- Signal-native adapters implement it with their framework primitives and can keep option reads in the same reactive graph.
- Store-backed adapters keep options synchronized during render; in React, granular rendering is opt-in through selectors and `Subscribe`.

Your application code still passes ordinary values and calls the same Table methods it always has. The rest of this article retraces how we got here: the adapter-level approaches we tried, the limits they exposed, and why the reactive boundary ultimately had to move underneath the Table APIs.

## The Table V8 Starting Point

Before Table V9 moved reactivity underneath the Table APIs, adapters connected the stable Table V8 instance to each framework's update model.

### Keeping a Stable Table Instance in Sync

TanStack Table V8 used a contract that served the library well across frameworks. The core built one table instance, attached feature APIs to it, stored resolved options on it, and exposed `setOptions` and `setState` so each adapter could keep that instance aligned with its framework.

Table owned the table logic, React, Vue, Solid, Svelte, and Angular owned their render cycles, and each adapter sat between those two worlds to push fresh options into the table instance when framework state changed.

Controlled pagination gives a concrete example: when a user clicks the next-page button, Table calls `onPaginationChange` and user code updates framework state. On the next render, the adapter passes the new `state.pagination` value back through `table.setOptions`, allowing the core to read `table.options.state.pagination` while continuing to use the same table instance.

```ts
const table = createTable({
  state: { pagination },
  onPaginationChange: setPagination,
  // ...
})

table.setOptions((prev) => ({
  ...prev,
  state: { ...prev.state, pagination },
}))
```

That contract kept the core portable, but the framework could not see which state, option, row, column, or cell value a call such as `table.getRowModel()` touched, even when Table's own memoization could reuse the result. Any connection between those reads and the framework render cycle had to be built by the adapter from the outside.

The React adapter also predated React Compiler, and the [Table V8 documentation](https://tanstack.com/table/v8/docs/installation) warned that compiler-enabled apps might not work.

### Making Table V8 Reactive in Angular with Signals

At the time, TanStack Table did not have an Angular adapter, and I was contributing to the project from the outside just as Angular introduced signals. The new reactive model made an Angular adapter practical to explore, and building it became my entry point into Table.

I kept the Table V8 core contract intact. `createAngularTable` accepted a reactive options callback, allowing the adapter to track values such as `data()` and synchronize the latest options through `setOptions`.

```ts
const data = signal<Person[]>([])
const pagination = signal<PaginationState>({
  pageIndex: 0,
  pageSize: 20,
})

const table = createAngularTable(() => ({
  data: data(),
  columns,
  state: {
    pagination: pagination(),
  },
  onPaginationChange: (updater) =>
    pagination.update((prev) =>
      typeof updater === 'function' ? updater(prev) : updater,
    ),
}))
```

That solved reactivity at the adapter input, but Table's APIs were still plain method calls. Calling `table.getRowModel()` inside a `computed`, effect, or template did not give Angular a dependency to track.

To bridge that gap, the adapter exposed the stable table instance through `tableSignal` and returned a proxy around it. Eligible `get*` methods lazily created an Angular `computed` that read `tableSignal()` before invoking the original method. A call such as `table.getRowModel()` could then participate in Angular's reactive context without changing the Table V8 core.

The proxy's `get` handler can be reduced to this pseudocode:

```ts
return new Proxy(tableSignal, {
  get(_, property) {
    const table = untracked(tableSignal)
    const method = table[property]

    if (canBeComputed(property, method)) {
      if (method.length === 0) {
        // No arguments: one computed is enough.
        return computed(() => {
          tableSignal()
          return method()
        })
      }

      // With arguments: return a function that reads from a computed
      // cached by the argument set.
      // Implementation omitted.
    }

    return method
  },
})
```

The second branch covered methods such as `getColumn(columnId)` or `getRow(id, searchAll?)`. Each distinct set of arguments received its own computed, and later calls with the same arguments invoked the cached one. This preserved the original call signature while keeping the method reactive.

Components rendered from column definitions made the integration harder. A `cell` definition could render an [`OnPush`](https://angular.dev/best-practices/skipping-subtrees) component through `flexRender`. `OnPush`, now Angular's default change-detection strategy, avoids checking a component subtree until Angular has a reason to do so, such as a new input, an event in that subtree, a tracked signal update, or an explicit request to check the view.

In this case, `flexRender` could keep passing the same `CellContext` reference while the values returned by its Table methods changed. Angular saw neither a new input nor a signal dependency behind those methods, so the adapter had to coordinate table updates with view checks to keep the component current.

The Angular adapter went through several iterations to make ordinary Table calls update reliably, including components rendered through `flexRender` with stable inputs. Its reactive boundary remained broad, however: the proxy only covered methods reached through the table instance, while `flexRender` had to re-check rendered content broadly instead of following only the state read by each component.

React Compiler later exposed a similar boundary in React. A cell component could receive a stable `row` reference while `row.getIsSelected()` changed behind it, allowing the compiler to reuse memoized JSX because it could not see the state read hidden inside the method. Both cases pointed to the same Table V9 requirement: move reactivity underneath the Table APIs so rows, cells, headers, and columns can expose the dependencies they actually read.

## Where Table V9 Reactivity Started: Wrapping Table Methods

Table V9 introduced a deeper feature system, allowing a signal-based adapter to register reactivity while each table instance was constructed. Selected methods on the table, headers, columns, rows, and cells could be wrapped in derived reactive values. A call such as `row.getIsSelected()` could then participate in a tracked component, computed value, or effect without passing through the top-level table proxy.

That solved the proxy's limited reach, but attached reactive machinery to the API objects created for each table instance, including the rows and cells materialized by its row models. Some of that work could be deferred until first access, but constructing row models and rendering the table still exercised part of the API, while creating computed wrappers lazily complicated method access and caching. With `R` rows and `C` cells per row, the cell portion alone covered `R × C` objects. If each cell exposed `N` eligible methods, the wrapping surface grew roughly as `R × C × N`, before counting the methods on rows, headers, columns, and the table itself. Those methods ultimately read a much smaller set of shared state and options, yet reactivity followed the shape of the constructed object graph.

The boundary needed to move underneath the methods instead. Making state and option reads reactive would let the same APIs expose their dependencies without wrapping each method on every object.

## Moving the Reactive Boundary into the Core

TanStack Table first adopted [TanStack Store](https://github.com/TanStack/table/pull/6143) as part of the Table V9 rewrite. The initial implementation used the class-based `Store` and `Derived` APIs available at the time: one base store held Table-owned state, while a derived table-state snapshot reconciled it with controlled values such as `state.rowSelection`. State management had moved into the core, but every feature still read from one aggregated snapshot, while options remained plain values outside the store.

Shortly afterward, the [`@tanstack/store` 0.9 update](https://github.com/TanStack/table/pull/6180) moved Store itself to a signal-backed implementation built on a modified version of `alien-signals`. Table adopted the new `createStore` and `createAtom` API, bringing signal-based dependency tracking into the core without changing its high-level state model.

## Bringing Table Options into the Reactive Model

The reactive state graph gave us a better place to read pagination, sorting, row selection, and the other state slices, but option changes still lived outside it. Since a table also depends on `data`, `columns`, row model factories, feature flags, callbacks, and user-provided getters, Table needed a reliable way for later reads to see those values when they changed after construction.

This showed up in adapters as forced refresh code. An older framework adapter path updated the options and then cloned the base state only to wake up Store subscribers:

```ts
table.setOptions(updatedOptions)
table.baseStore.setState((prev) => ({ ...prev }))
```

The second line did not change table state; it forced dependent reads to run because an option had changed outside the state graph.

The `enableRowSelection` option is a good example. A row checkbox depends on `rowSelection` state and on whether that row can be selected at all. If an Angular, Solid, or Vue app changes `enableRowSelection` from a reactive value, `row.getCanSelect()` needs to see that option change. Updating selection state alone cannot fix a stale option read.

[PR #6181](https://github.com/TanStack/table/pull/6181) added an `optionsStore`. Instead of storing resolved options only as a plain object on the table, the table could read options through a store-backed getter. `table.setOptions` updated that store, and table APIs that touched `table.options` could participate in the same reactive graph as state reads.

```ts
Object.defineProperty(table, 'options', {
  get() {
    return table.optionsStore.state
  },
  set(value) {
    table.optionsStore.setState(() => value)
  },
})
```

Options reactivity brought the core model closer to how users write table code, where `data`, feature flags, and callbacks come from components and need to remain live inputs rather than construction-time configuration.

## Keeping Two Reactive Graphs in Sync

The Store-backed core still had to connect to each framework's reactive graph. A Store update could not schedule Angular, Solid, or Vue by itself; each adapter needed a native signal, memo, ref, or computed in the dependency path. Kevin and I iterated on where to make that translation.

One version of that bridge used notifiers: the core remained Store-backed, while the adapter supplied functions that the framework could track and updated them whenever table state or options changed. The feature patched the Store `state` getter so it read the matching framework notifier before returning the Store value:

```ts
table.store = bindStore(table.store, () => stateSignal())
table.optionsStore = bindStore(table.optionsStore, () => optionsSignal())

function bindStore(store, notifier) {
  const descriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(store),
    'state',
  )!

  Object.defineProperty(store, 'state', {
    get() {
      notifier?.()
      return descriptor.get!.call(store)
    },
  })

  return store
}
```

If Angular read `table.store.state` inside a `computed`, the notifier gave Angular a dependency to track, allowing the adapter to trigger the computation again before it read the latest Store state.

The notifier bridge let signal adapters wake their UI, but synchronizing two graphs introduced failure modes. In React, updating the options store during render could notify subscribers and schedule another render that synchronized the same options again. Signal adapters could instead miss an update when the component never read the notifier. Scheduling and untracked reads addressed individual cases, but the durable answer was one graph per adapter, implemented through a shared core contract.

## State Became Granular

[PR #6234](https://github.com/TanStack/table/pull/6234) split the table-state snapshot into separate atoms for each feature. Each slice has a writable base atom for Table-owned state and a readonly atom through which Table resolves the current value. A method such as `row.getIsSelected()` can now depend on row selection without subscribing to the entire table-state snapshot.

This is where automatic dependency tracking becomes useful. When Angular runs a `computed`, Solid runs a `createMemo`, or Vue runs a `computed`, the framework records the reactive values read while that function executes. Since options had already moved into the graph, one Table calculation could now depend on feature state and options at the same time.

A simplified version of the page-selection calculation makes those dependencies visible:

```ts
function getIsAllPageRowsSelected(table) {
  const rows = table.getPaginatedRowModel().flatRows
  const rowSelection = table.atoms.rowSelection.get()
  const enableRowSelection = table.options.enableRowSelection

  const selectableRows = rows.filter((row) =>
    typeof enableRowSelection === 'function'
      ? enableRowSelection(row)
      : (enableRowSelection ?? true),
  )

  return (
    selectableRows.length > 0 &&
    selectableRows.every((row) => Boolean(rowSelection[row.id]))
  )
}
```

In a native signal adapter, evaluating this method inside a component, `computed`, or `createMemo` records those three incoming reads automatically.

Per-feature atoms gave the graph the granularity we wanted, leaving one question: did every adapter have to build those atoms with the same runtime implementation, or could the core depend only on their shared contract?

## The Final Design: One Contract, Many Reactive Runtimes

TanStack Router gave us a useful precedent around the same time because it had its own state graph, its own adapters, and the same need to run well across React, Solid, and Vue. Its work on a [store factory](https://github.com/TanStack/router/pull/6704) and [native Solid primitives](https://github.com/TanStack/router/pull/6730) showed that the core could depend on a small shared shape while each adapter supplied the implementation that made sense for its framework.

### The Core Contract

[PR #6237](https://github.com/TanStack/table/pull/6237) made the implementation behind those atoms configurable. We kept TanStack Store's atom contracts as the common language while allowing each adapter to provide the primitives underneath. In other words, the core depends on the shared `Atom` and `ReadonlyAtom` surfaces, not on the runtime that implements them. The essential part of that contract is small:

```ts
interface TableReactivityBindings {
  createWritableAtom: <T>(value: T, options?: TableAtomOptions<T>) => Atom<T>
  createReadonlyAtom: <T>(
    fn: () => T,
    options?: TableAtomOptions<T>,
  ) => ReadonlyAtom<T>
  batch: (fn: () => void) => void
  schedule: (fn: () => void) => void
  untrack: <T>(fn: () => T) => T
}
```

The full interface also covers options-store creation, subscriptions, and cleanup. `constructTable` uses these bindings to build the same feature atoms for every adapter.

React implements those calls with TanStack Store atoms. Angular, Solid, and Vue reuse their native reactive primitives and import the shared Store interfaces only as types, so those imports disappear from the emitted JavaScript. Batching and scheduling can come from the framework as well: Solid, for example, passes `batch` from `solid-js`. `constructTable` does not need a framework-specific branch, and frameworks without native signals can use the TanStack Store implementation directly.

### Framework Bindings

The adapter mapping remains small. The following pseudocode uses generic signal primitives, but the shape is the same whether an adapter builds it with a signal, memo, ref, or computed value:

```ts
import {
  createComputed,
  createSignal,
  type ReadonlySignal,
  type WritableSignal,
} from 'your-signal-primitives'
import type { Atom, ReadonlyAtom } from '@tanstack/store'

function signalToReadonlyAtom<T>(source: ReadonlySignal<T>): ReadonlyAtom<T> {
  // implementation: expose the signal through `get` and `subscribe`
}

function signalToWritableAtom<T>(source: WritableSignal<T>): Atom<T> {
  // implementation: expose the signal through `get`, `set`, and `subscribe`
}

const nativeBindings = {
  createReadonlyAtom<T>(
    fn: () => T,
    _options?: TableAtomOptions<T>,
  ): ReadonlyAtom<T> {
    return signalToReadonlyAtom(createComputed(fn))
  },
  createWritableAtom<T>(
    initialValue: T,
    _options?: TableAtomOptions<T>,
  ): Atom<T> {
    return signalToWritableAtom(createSignal(initialValue))
  },
}
```

That is the core atom mapping: a native readonly signal becomes a Store-compatible `ReadonlyAtom`, while a native writable signal becomes an `Atom`. The real adapters also preserve their framework lifecycle and subscription context. Angular does that in its [reactivity bindings](https://github.com/TanStack/table/blob/beta/packages/angular-table/src/reactivity.ts), Solid in its [Solid bindings](https://github.com/TanStack/table/blob/beta/packages/solid-table/src/reactivity.ts), and Vue in its [Vue bindings](https://github.com/TanStack/table/blob/beta/packages/vue-table/src/reactivity.ts).

The core was already framework-agnostic in Table V8; Table V9 makes its reactivity layer portable too. The recently added [Ember adapter](https://github.com/TanStack/table/pull/6397), contributed by [Ryan Tablada](https://github.com/rtablada), shows that the contract does not require a conventional signals API: Ember's `@tracked` writable values and `@cached` derived values only need to expose compatible `Atom` and `ReadonlyAtom` surfaces. Table V9 also adds Preact and Alpine adapters, which provide Store-backed bindings. Rendering and lifecycle remain framework-specific, but a new adapter no longer needs a separate Table state model.

## What This Changes for TanStack Table Users

Reactivity now sits below the Table APIs, where each adapter can connect state and option reads to the component or subtree that should update.

### Automatic Tracking in Signal-Native Adapters

In signal-native adapters, calling a Table method inside a tracked component, computed value, or effect is enough to register its dependencies. A Solid component calling `table.getPageCount()`, for example, tracks the native primitives read underneath that method.

The framework can then update only the reactive scope that performed the read, without an explicit `Subscribe` component. React reaches a similar result through TanStack Store selectors and explicit subscription boundaries.

### Granular React Rendering and Compiler Compatibility

React does not collect signal reads during render, so its adapter builds the table graph with `@tanstack/react-store`. Its `useSelector` hook connects an atom or Store to React through the selector-compatible `useSyncExternalStoreWithSelector` shim, using the source's `get` and `subscribe` methods.

By default, `useTable` subscribes to every registered state slice, so any slice change schedules the table component. A basic table therefore needs no explicit selector or `Subscribe`, and React Compiler can observe the dependency at that level.

Granular rendering is opt-in. `useTable` accepts a selector as its second argument to narrow the state that schedules the table component, while `Subscribe` creates an independent boundary lower in the tree. This is useful for components rendered from column definitions, where stable `row`, `cell`, or `header` references can hide the state read behind a Table method. The row-selection widget from the beginning can make that dependency explicit:

```tsx
import { Subscribe } from '@tanstack/react-table'

const selectionColumn = columnHelper.display({
  id: 'select',
  cell: ({ row, table }) => (
    <Subscribe
      source={table.atoms.rowSelection}
      selector={(selection) => selection[row.id]}
    >
      {(isSelected) => (
        <RowSelectionWidget
          checked={Boolean(isSelected)}
          onChange={row.getToggleSelectedHandler()}
        />
      )}
    </Subscribe>
  ),
})
```

`Subscribe` uses `useSelector` underneath, so the compiler can keep the cell memoized and still update the widget when that row changes. Inline cells that already rerender with their parent usually do not need another boundary. The same opt-in mechanism can isolate frequently changing state such as filtering or column sizing; the [basic Subscribe example](https://tanstack.com/table/beta/docs/framework/react/examples/basic-subscribe?panel=code) shows the pattern in a complete table.

## Reactivity Where It Belongs

The path to Table V9 ran through proxies, wrapped methods, broad render checks, and bridges between reactive systems. Each iteration solved a real adapter problem, but they all pointed to the same boundary: reactivity needed to live underneath the Table APIs, where each framework could connect it to the primitives that already drive its UI.

Back in the opening grid, the result is deliberately ordinary. Selecting a row can update its checkbox and the selected-row counter without treating every editor, filter, and pagination control as part of the same update. Changing page size can replace the visible rows, and column sizing can update the affected layout, while unrelated components remain outside those paths.

Applications still pass ordinary values and call the same Table methods. Table V9 makes the machinery underneath those calls more explicit so that it can stay out of application code.

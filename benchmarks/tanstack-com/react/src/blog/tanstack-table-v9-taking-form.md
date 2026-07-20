---
title: 'TanStack Table V9: Taking Form'
published: 2026-06-07
excerpt: TanStack Table V9 is now in Beta. It wouldn't be as good as it is without our learnings from building TanStack Form.
library: table
authors:
  - Kevin Van Cott
---

![TanStack Table V9 - Taking Form](/blog-assets/tanstack-table-v9-taking-form/header.png)

TanStack Table V9 has been a long time coming, and at this point, it has probably taken too long 😅, but it is finally _almost\*_ here... almost.

🎉 🎉 🎉 Announcing TanStack Table V9 Beta today! 🎉 🎉 🎉

## TL;DR

TanStack Table V9 has major state management improvements, is more tree-shakable, extendable, and composable while maintaining type safety, uses less memory, has broadly improved performance, has a much better devtools experience, has some new API patterns for setting up your table and table state management, and is caught up to the latest versions and patterns for React, Preact, Solid, Vue, Angular, Svelte, and Lit.

## The Backstory on V9

TanStack Table V9 has been a multi-year project for me (Kevin). Tanner handed me the maintainer keys for Table back in 2022 and started to trust me as the lead maintainer by the end of 2023 as he moved on to focus on TanStack Router and eventually TanStack Start. Since then, it has pretty much just been me and a few other drive-by contributors working on the project in my free time, which, of course, I never have enough of.

Although, this changed a little over a year ago when [Riccardo Perra](https://github.com/riccardoperra) joined the TanStack Table team as a contributor. He's been instrumental in helping us finalize the new state management system, especially for the non-React signal-based adapters like Angular and Solid.

Still, maintenance of the project has been a bit lackluster, especially as we have focussed on this new version for well-over the past year.

The development of V9 often stalled as we tried to figure out the correct approaches. Thankfully, the start of work on another TanStack library (TanStack Form) gave us a new perspective on how to approach the problems. Eventually, we were able to cheat a bit and just copy the same approaches that Corbin introduced to us from his work on TanStack Form and TanStack Store. The major state management improvements that we are introducing in V9 wouldn't have been quite as good without this new perspective.

### What Was Wrong With V8?

TanStack Table V8 has been out for 4 years now 🤯. It has been pretty successful, but it also has suffered from a few issues caused by the fundamental design choices of v8.

From both the constant feedback that we gather and our own experiences as maintainers, these were the biggest issues with V8:

1. **State management didn't follow official React patterns.** This had been a smell for a while, but the moment the React Compiler became stable, TanStack Table V8 started breaking. The same state management system also made the non-React adapters harder to interact with.
2. **There wasn't enough control over re-rendering or memoization.** Big tables paid the price for every state change, even when the part of state that changed had nothing to do with the part being rendered. The larger your table, the more memoization hacks you would find yourself trying to implement to keep your table performing well.
3. **Large virtualized tables used too much memory.** TanStack Table was using more memory than expected, especially at the large scales of virtualized tables, which we definitely want to have as a core offering.
4. **The feature set could feel bloated to some users and too basic to others at the same time.** Every feature and API that TanStack Table includes is currently very specifically scoped. We often found ourselves playing code-golf while working on fixes and improvements in order to not bloat the bundle for everyone. We needed to find a way to make TanStack Table scale both up and down without making the library overall worse for everyone.
5. **Extending the library with custom functionality was difficult, or at least unclear.** Our answer to custom functionality was to just recommend using composition (Write your own code along-side TanStack Table code). While this is still good advice, we know that there are better ways to let you extend the library with your own functionality.
6. **Making reusable table code was not straightforward.** If you had multiple tables that shared the same features, row models, table components, cell components, and default options, you had to invent your own wrapper patterns. This was possible, but it was not obvious or officially supported in a way that felt as good as the rest of TanStack.
7. **The devtools were lackluster.** Useful devtools, outside of some basic debug logging, were neglected. They needed a refresh.

These were all important problems that needed to be addressed, but we probably only needed to address one or two of them at a time for a new major release.

I made what can now most definitely be considered a big mistake in trying to address all of these issues at once. It didn't start out that way, but now that we are at the end of alpha development, it is clear that this is what happened and that it would have been much more beneficial to move faster and deliver smaller improvements more frequently.

Now that we are shipping V9 with fixes to all of the above, it's great and I think most will be very happy with the improvements, but we should try to prioritize the issues that actually matter better in the future, especially when we the maintainers have limited time to actually work on the project.

On the bright side, V9 is going to be a foundational release for the future of TanStack Table to build upon.

### The Start of V9 Development

I've ordered the above list is issues of V8 in roughly the order of importance based on user complaints from the community that we've received over the years. So you'd think that the next major version of TanStack Table would start by addressing each of those issues in turn. But that's not what happened, unfortunately.

In late 2023, I had this idea I couldn't "shake". What if Table V9 could be tree-shakable again, in a way similar to how react-table v7 was? One of the complaints that I've seen about TanStack Table was that it was "overkill" for simple use-cases. I usually disagreed with this, as TanStack Table V8 was a relatively small library with a bundle size of under 15kb, but I could see the point when developers would only be using less than 10% of the included API surface.

A bit more history is useful here. React Table v7 had a hook-based plugin model. You only paid in bundle size for the features you actually used. It was very tree-shakable!

```ts
// react-table v7
const instance = useTable(
  { columns, data },
  useSortBy,
  useFilters,
  usePagination,
)
```

When Tanner rewrote the project for V8, a lot of that model went away. For some context, V8 was the first TanStack project to be rewritten fully in TypeScript (by Tanner himself), and the type system became, correctly, the most important constraint. V7's hook-plugin shape didn't translate cleanly to a strongly-typed core, so V8 ended up with one aggregated table model where every feature's types and code were pulled in together. Tree-shakability got deprioritized so the type story could be great.

That trade was the right call. V8 is type-safe in a way v7 never was. But I kept poking at the question: could you have both? Could V9 give you v7's "only pay for what you use" and V8's type safety at the same time?

I started prototyping. I figured it would take a few weeks. The full thinking lives in the V9 RFC trail ([#5270](https://github.com/TanStack/table/discussions/5270), [#5595](https://github.com/TanStack/table/discussions/5595), [#5834](https://github.com/TanStack/table/discussions/5834)) if you want the long version.

### A Year on the Wrong Problem

It didn't take a few months. It took over a year, and even then it wasn't really done. By early 2025 I had the tree-shakable refactor 99% working. The last 1% of getting TypeScript to work perfectly was going to be the death of me. Types are a cruel place to spend your limited free time 😭.

![Any Year Now](/blog-assets/tanstack-table-v9-taking-form/screenshot-1.png)

And then, while I was head-down on my favorite tree-shaking problem, the React Compiler shipped.

The Compiler did me a favor I didn't ask for. It made the state management problem unignorable. The patterns Table had been using since V8 weren't compatible with the rules the Compiler now enforced. Suddenly, this was the most important problem I needed to address. And I found that it was actually a pretty hard problem to get 100% correct for all use cases and edge cases that we needed to continue to support.

### Help arrives from TanStack Form

[Corbin Crutchley](https://github.com/crutchcorn) had recently joined TanStack and was busy turning TanStack Form into something genuinely awesome. Form needed exactly the things Table needed: a way to model state once, in a core that wasn't React-flavored, and have it work with any JavaScript framework plus the React Compiler.

The answer Form arrived at was a signals-style store with atom slices, derived state, selector-based subscriptions, and a single source of truth that every adapter could read and write to. This ended up being just about the same state management system that we needed for Table. It still took us a while to perfectly adapt the reactivity for how we needed it to work in Table, but we have eventually got it to work pretty well.

In 2025, I actually ended up taking a small break from working exclusively on Table to start a new library called TanStack Pacer where I could more freely experiment at a smaller scale with our new TanStack Store state management patterns. This ended up being a very valuable side-quest, though TanStack Pacer itself is now growing into it's own early succesful project that requires even more time and attention.

## What's New in V9?

So that's the backstory for how TanStack Table V9 was developed. Now let's talk specifically about what's new in V9.

### 1. State Management with TanStack Store

You can still use the old syntax for custom state management as you did in V8, but now we use TanStack Store under the hood, and we let you use TanStack Store along-side TanStack Table.

Here's the traditional way to manage state in V8, and you can still do this in V9.

```ts
// v8-style custom state
const [pagination, setPagination] = useState({
  pageIndex: 0,
  pageSize: 10,
})

const table = useTable({
  ...otherOptions,
  state: {
    pagination, // manage
  },
  onPaginationChange: setPagination, // required to hoist state updates to your scope
})
```

But now, you can also manage state with TanStack Store Atoms.

```ts
const paginationAtom = useCreateAtom({
  pageIndex: 0,
  pageSize: 10,
})

const table = useTable({
  ...otherOptions,
  atoms: {
    pagination: paginationAtom,
  },
})
```

This might not seem like a big deal, until we next discuss the benefits of using TanStack Store Atoms for state management over traditional React state management.

### 2. Re-Rendering and Memoization Control

Now that TanStack Table V9 uses TanStack Store under the hood, it gives you an option to control exactly how each part of your react tree re-renders when state changes via state selectors. By default, the entire table will re-render when any state changes, but this is just because of the default `state => state` selector when not specified.

```ts
const table = useTable(
  {
    ...options,
  },
  // 2nd arg for customizing the state selector
  // (state) => state, // default selector
  (state) => ({
    pagination: state.pagination, // now only re-renders the entire table when pagination changes. All other state changes will be opt-in with `table.Subscribe`
  }),
)

console.log(table.state) // logs { pagination: { pageIndex: 0, pageSize: 10 } }
```

This is the easy migration path. If you want the table component to behave a lot like V8, subscribe to the full state and keep rendering from `table.state`. If you want the V9 performance model, subscribe to less at the top and move the reactive reads closer to the components that actually need them.

Let's take row selection as an example:

```tsx
<table.Subscribe source={table.atoms.rowSelection}>
  {(rowSelection) => (
    <div>{Object.keys(rowSelection).length.toLocaleString()} rows selected</div>
  )}
</table.Subscribe>
```

This is the kind of thing that sounds small until you have a giant table. Row selection changes should not have to re-render your pagination controls, your filter inputs, your table wrapper, and every other component that happens to have access to the table instance. In V9, you can subscribe to `rowSelection` exactly where the selected row count is rendered.

For TanStack Form users, this should feel familiar. `form.Subscribe` and `table.Subscribe` are not the same API by accident. This is one of the places where Table very directly took form.

One more small but important escape hatch: V9 also exports the underlying static functions that power many of the builder-pattern APIs. The builder APIs are still the main API, but static functions let you call the raw implementation directly when you want to opt out of our default memoization for a rare use case, or when you want one feature API without installing the whole feature onto the table instance.

This could also be useful for a future Qwik adapter in the future.

```ts
import { row_getIsSelected } from '@tanstack/react-table/static-functions'

// const isSelected = row.getIsSelected();
const isSelected = row_getIsSelected(row) // optional static function instead of using the builder-pattern method
```

### 3. Less Memory Usage for Large Virtualized Tables

Large virtualized tables exposed another V8 problem: even if you were only rendering a small window of rows, the table still had to create and maintain a lot of row, cell, and derived row-model objects behind the scenes.

Some of that was just the nature of what Table does. A headless table library still needs a row model. But some of it was self-inflicted. Around the same time we were working on the new V9 state model, [mleibman-db](https://github.com/mleibman-db) opened [PR #5927](https://github.com/TanStack/table/pull/5927), which significantly reduced memory usage in V8 by moving more table APIs onto shared prototypes instead of recreating methods per instance.

That work was eventually ported into V9 and then expanded on. Rows, cells, headers, and columns are now constructed with memory efficiency as a first-class constraint. Feature APIs are assigned to shared prototypes where possible. Per-instance data is still there when a feature needs it, but we are much more careful about what has to be allocated for every row and cell.

There has also been a broader performance pass happening in V9. Some of those wins are not glamorous. They are things like removing unnecessary intermediate arrays, tightening dependency checks in memoized functions, avoiding wasted row clones, and adding memoization where virtualized layouts call the same size calculations over and over.

That is exactly the kind of boring work that matters for tables at scale. A table can call the same small pieces of code thousands or millions of times. Small allocations become real allocations. Unnecessary row-model walks add up. V9 is not "done" with performance work, but both the memory and cpu usage are already in a much better place.

### 4. Tree-Shakable Features That Scale Up and Down

The tree-shakable feature work did make it into V9. To be clear, V8 was already somewhat tree-shakable. The client-side RowModels were opt-in. `filterFns`, `sortingFns`, and `aggregationFns` could be imported separately. We had already learned that tables need a way to pay for only some of the expensive data-processing code.

V9 takes that idea a few steps further. Now the entire API surface for each feature is opt-in too. Features are no longer just "inside Table" by default. They are registered more like plugins, alongside the row models your table needs:

```ts
import {
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from '@tanstack/react-table'

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
})

const table = useTable({
  features,
  rowModels: {
    paginatedRowModel: createPaginatedRowModel(),
    sortedRowModel: createSortedRowModel(sortFns),
  },
  columns,
  data,
})
```

If you do not register `rowSortingFeature`, you do not get sorting APIs and you do not ship sorting code. TypeScript knows that too, which is the part that took forever to get right. `table.setSorting` exists when sorting is registered. It does not exist when it is not. The same idea applies across the rest of the feature APIs.

This solves the "bloated to some, too basic for others" problem in a much healthier way. A tiny table can use `tableFeatures({})` and only get the core row model. A full enterprise grid can register sorting, filtering, faceting, grouping, pagination, row selection, pinning, sizing, and everything else it needs.

And yes, if you just want the V8-style "give me everything" setup while you migrate, `stockFeatures` exists. I would not use it as the default for new code, because it gives up a lot of the point of V9, but it is a useful bridge.

### 5. Custom Features and Clearer Extension Points

V8's answer to custom functionality was usually: compose around the table. That was, and still is, good advice. But it was not always satisfying advice.

If you were building something like [Material React Table](https://material-react-table.com/), or a design-system table wrapper, or a table with app-specific behaviors like density, keyboard navigation, analytics, custom row actions, or server-side conventions, you could absolutely build those things around TanStack Table. But there was not a very clear "this is how Table itself adds features, and you can do the same thing" path.

V9 changes that. The built-in features are just feature objects. They can provide default options, initial state, table APIs, column APIs, row APIs, cell APIs, and header APIs. Custom features can use that same system:

```ts
const features = tableFeatures({
  rowPaginationFeature,
  densityFeature, // make your own feature APIs, works just like a built-in feature!
})

const table = useTable({
  features,
  rowModels: {
    paginatedRowModel: createPaginatedRowModel(),
  },
  columns,
  data,
})
```

That does not mean every custom behavior should become a Table feature. A lot of app code should still just be app code. But for reusable table packages and serious table abstractions, V9 finally gives you a first-class extension model that matches how the core library is built.

This also means we can be more disciplined about what belongs in core. We do not have to accept every useful feature into TanStack Table itself just because there was no other clean way to build it. The core can stay smaller, while advanced users and ecosystem libraries get a better path to go further.

> **Note:** The TypeScript generics for custom features still don't work perfectly. Declaration merging is still supported to fix those use cases. This might be worked on more in the future.

### 6. Reusable Table Code with createTableHook

Another place Table took from Form is in reusable composition. TanStack Form has a `createFormHook` for defining shared form infrastructure once, then reusing it across an app. Table V9 now has the same idea with `createTableHook`.

The new [Composable Tables example](/table/latest/examples/composable-tables) shows this pattern too. You define your common table features, row models, default options, and reusable table/cell/header components once. Then each table only brings its own columns, data, and any custom options it needs:

```tsx
import {
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from '@tanstack/react-table'

// Set up this stuff once, use for all tables
export const { useAppTable, createAppColumnHelper } = createTableHook({
  features: tableFeatures({
    rowPaginationFeature,
    rowSortingFeature,
  }),
  rowModels: {
    sortedRowModel: createSortedRowModel(sortFns),
    paginatedRowModel: createPaginatedRowModel(),
  },
  tableComponents: {
    PaginationControls,
    RowCount,
  },
  cellComponents: {
    TextCell,
    NumberCell,
    RowActionsCell,
  },
})

const columnHelper = createAppColumnHelper<Person>()

function UsersTable({ data }: { data: Person[] }) {
  const columns = columnHelper.columns([
    columnHelper.accessor('firstName', {
      header: 'First Name',
      cell: ({ cell }) => <cell.TextCell />,
    }),
    columnHelper.display({
      id: 'actions',
      cell: ({ cell }) => <cell.RowActionsCell />,
    }),
  ])

  const table = useAppTable({ columns, data }) // simpler "useTable" usage with features, row models, and table components already set up elsewhere

  return (
    <table.AppTable>
      {() => (
        <>
          <table.RowCount />
          <table.PaginationControls />
        </>
      )}
    </table.AppTable>
  )
}
```

This makes it much easier to build a family of similar tables without re-declaring the same features and rendering conventions in every file. Your app can have one "app table" setup, or several setups for different table families, and still keep the column definitions and table instances strongly typed.

There is also a new `tableOptions` helper for composing reusable option objects, similar in spirit to `queryOptions` in TanStack Query. It is a smaller utility than `createTableHook`, but it is useful when you just want type-safe shared options that can be spread into different table setups.

### 7. Real Devtools

The last V8 problem was devtools, and this one is mostly thanks to [AlemTuzlak](https://github.com/AlemTuzlak)'s work on the new `@tanstack/devtools` platform.

Table V9 now has a real devtools integration. In React, you mount the TanStack Devtools host, add the table plugin, and register each table instance:

```tsx
import { TanStackDevtools } from '@tanstack/react-devtools'
import {
  tableDevtoolsPlugin,
  useTanStackTableDevtools,
} from '@tanstack/react-table-devtools'

function UsersTable() {
  const table = useTable({
    key: 'users-table',
    features,
    rowModels,
    columns,
    data,
  })

  useTanStackTableDevtools(table)

  return <TableView table={table} />
}

function App() {
  return (
    <>
      <UsersTable />
      <TanStackDevtools plugins={[tableDevtoolsPlugin()]} />
    </>
  )
}
```

The goal is pretty simple: when your table is not doing what you think it is doing, you should not have to start spelunking through `console.log(table.getState())` again. You should be able to inspect the table, its state, and its derived data in a supported panel that is built for Table.

The default devtools entrypoint is also development-only, so you do not accidentally ship the real devtools implementation to production. If you do want production devtools for a preview environment or an internal admin tool, there is a `/production` entrypoint for that too.

## Where this leaves us

TanStack Table V9 has taken way too long to get here. I am not going to pretend otherwise. But what's in V9 right now is, honestly, the version of Table I wish I had been writing the whole time:

- State management that follows React's rules, plays well with the Compiler, and works well with all javascript frameworks
- Granular re-rendering via selectors and `Subscribe`
- Better memory and cpu usage for large tables
- Tree-shakable features, so the bundle reflects what you actually use, giving TanStack Table room to grow
- Custom features that can plug into the same system as built-in features
- `createTableHook` and `tableOptions`, so reusable table code is much easier to organize
- Devtools that exist and are actually supported

We think we are mostly done with the foundational changes for V9 in terms of state management, tree-shakability, etc. Now, while we are in beta, we have some good opportunities to make some final needed breaking changes and fixes to the features themselves before we go stable. We hope that this will not be as long of a beta process as some of the other TanStack libraries, but it depends on the feedback we get from the community and how much community help we can get to test and fix the issues that we find.

If you have the stomach for a beta, I would love your help kicking the tires. You can find the V9 docs [here](/table/beta).

We also have a [full migration guide for V8 to V9](/table/beta/docs/framework/react/guide/migrating)!

We're also in the middle of a documentation rewrite for V9, already with lots of new examples and guides. Some pages might move around in the next few weeks as we finalize the new structure.

Here are a bunch of the new Kitchen Sink examples worth checking out:

- [React Kitchen Sink](/table/beta/docs/framework/react/examples/kitchen-sink)
- [React Kitchen Sink with Shadcn Base](/table/beta/docs/framework/react/examples/kitchen-sink-shadcn-base)
- [React Kitchen Sink with Shadcn Radix](/table/beta/docs/framework/react/examples/kitchen-sink-shadcn-radix)
- [React Kitchen Sink with Hero UI](/table/beta/docs/framework/react/examples/kitchen-sink-hero-ui)
- [React Kitchen Sink with Mantine](/table/beta/docs/framework/react/examples/kitchen-sink-mantine)
- [React Kitchen Sink with Material UI](/table/beta/docs/framework/react/examples/kitchen-sink-material-ui)
- [React Kitchen Sink with React Aria](/table/beta/docs/framework/react/examples/kitchen-sink-react-aria)
- [Angular Kitchen Sink](/table/beta/docs/framework/angular/examples/kitchen-sink)
- [Lit Kitchen Sink](/table/beta/docs/framework/lit/examples/kitchen-sink)
- [Preact Kitchen Sink](/table/beta/docs/framework/preact/examples/kitchen-sink)
- [Solid Kitchen Sink](/table/beta/docs/framework/solid/examples/kitchen-sink)
- [Svelte Kitchen Sink](/table/beta/docs/framework/svelte/examples/kitchen-sink)
- [Vue Kitchen Sink](/table/beta/docs/framework/vue/examples/kitchen-sink)

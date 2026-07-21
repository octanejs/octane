---
title: TypeScript Performance in TanStack Table V9
published: 2026-06-14
excerpt: TanStack Table V9's types do a lot more than V8's did. Here's how we cut type instantiations by 62-86% across every package between alpha.54 and beta.12 to keep the editor experience feeling instant.
library: table
authors:
  - Kevin Van Cott
---

![TanStack Table V9 - TypeScript Performance](/blog-assets/tanstack-table-v9-typescript-performance/header.png)

TanStack Table V9 has a much more capable, though more complex, type-level API than V8. The types in Table may not be as complicated as a project like TanStack Router or Form, but it has still grown more complex in V9 than it ever had been in previous versions.

If you had been using the Table V9 alphas, there's a chance that you could feel a bit of slowness in your editor. It probably was not enough to crash your TypeScript server, but it probably was noticeable. Good news, though! Between the alpha and the latest beta, we cut TypeScript's type-checking work by 62-86% across every package, and 36-79% across all examples in our docs! The latest beta now type-checks faster than our alpha versions from last week by a wide margin, and the editor experience is back to feeling instant.

This post covers where the cost came from, how we measured it, and the specific changes that fixed these issues. One of those changes is a still-overlooked TypeScript feature that many library authors seem to barely use, and it turned out to be one of our bigger optimizations, turning a trade-off into a win across the board.

## Why V9's types do more work than V8's

V8 pretty much had one `Table` type that you had to worry about. Every feature (sorting, filtering, grouping, pinning, and so on) was baked into a single `Table<TData>` whether you used it or not. That is easy on TypeScript: one interface, one generic parameter, nothing to compute. It is also part of why V8 couldn't tree-shake unused features out of your bundle, and why extending the table meant declaration-merging into global interfaces that affected every table in your app. These kind of limitations were the main complaints about TanStack Table V8.

TanStack Table V9 is introducing multiple improvements in the developer experience, and it mostly revolves around refactoring the way we used TypeScript. In V9, features are modular. You pass exactly the features you want, and both the runtime and the types are assembled from your selection:

```ts
const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { ...sortFns, mySortFn },
})

const table = useTable({ features, columns, data })
```

To support this, V9 introduces just one new generic parameter: `TFeatures`. That sounds modest, but it flows through everything, and it replaces a whole category of global declaration merging from V8 with per-table inference:

- The `table` you get back only has APIs for the features you registered. No sorting feature, no `table.setSorting()` or `column.toggleSorting()` APIs in the types or in the bundle.
- Custom `filterFns`, `sortFns`, and `aggregationFns` are inferred from the features object. `columnDef.sortFn` accepts `'mySortFn'` above because this table registered it.
- `TableMeta`, `ColumnMeta`, and filter meta are declared per table instead of merged globally, so your tables no longer share one meta shape.
- Plugins still use a small amount of declaration merging, but only to declare that they exist. Their types only show up on tables that register them.

Under the hood, the table's type is assembled from a feature map. Each entry maps a registerable feature to the APIs that feature adds to the table, and a helper selects the registered entries and intersects them. This is what it looks like in the latest beta:

```ts
export interface Table_FeatureMap<
  TFeatures extends TableFeatures,
  TData extends RowData,
> {
  columnFilteringFeature: Table_ColumnFiltering
  columnGroupingFeature: Table_ColumnGrouping<TFeatures, TData>
  columnOrderingFeature: Table_ColumnOrdering<TFeatures, TData>
  columnPinningFeature: Table_ColumnPinning<TFeatures, TData>
  columnResizingFeature: Table_ColumnResizing
  columnSizingFeature: Table_ColumnSizing
  columnVisibilityFeature: Table_ColumnVisibility<TFeatures, TData>
  columnFacetingFeature: Table_ColumnFaceting<TFeatures, TData>
  globalFilteringFeature: Table_GlobalFiltering<TFeatures, TData>
  rowExpandingFeature: Table_RowExpanding<TFeatures, TData>
  rowPaginationFeature: Table_RowPagination<TFeatures, TData>
  rowPinningFeature: Table_RowPinning<TFeatures, TData>
  rowSelectionFeature: Table_RowSelection<TFeatures, TData>
  rowSortingFeature: Table_RowSorting<TFeatures, TData>
}

export type Table<
  TFeatures extends TableFeatures,
  TData extends RowData,
> = Table_Core<TFeatures, TData> &
  ExtractFeatureMapTypes<TFeatures, Table_FeatureMap<TFeatures, TData>>
```

It did not start out this clean. In the alpha versions, there was no feature map and no shared helper. The selection logic was written out by hand, one conditional branch per feature, fed into `UnionToIntersection` to glue all of the table's APIs together:

```ts
// Avoid this Pattern!
export type Table<
  TFeatures extends TableFeatures,
  TData extends RowData,
> = Table_Core<TFeatures, TData> &
  UnionToIntersection<
    | ('columnFilteringFeature' extends keyof TFeatures
        ? Table_ColumnFiltering
        : never)
    | ('columnGroupingFeature' extends keyof TFeatures
        ? Table_ColumnGrouping<TFeatures, TData>
        : never)
    | ('columnOrderingFeature' extends keyof TFeatures
        ? Table_ColumnOrdering<TFeatures, TData>
        : never)
    | ('columnPinningFeature' extends keyof TFeatures
        ? Table_ColumnPinning<TFeatures, TData>
        : never)
    | ('columnResizingFeature' extends keyof TFeatures
        ? Table_ColumnResizing
        : never)
    | ('columnSizingFeature' extends keyof TFeatures
        ? Table_ColumnSizing
        : never)
    | ('columnVisibilityFeature' extends keyof TFeatures
        ? Table_ColumnVisibility<TFeatures, TData>
        : never)
    | ('columnFacetingFeature' extends keyof TFeatures
        ? Table_ColumnFaceting<TFeatures, TData>
        : never)
    | ('globalFilteringFeature' extends keyof TFeatures
        ? Table_GlobalFiltering<TFeatures, TData>
        : never)
    | ('rowExpandingFeature' extends keyof TFeatures
        ? Table_RowExpanding<TFeatures, TData>
        : never)
    | ('rowPaginationFeature' extends keyof TFeatures
        ? Table_RowPagination<TFeatures, TData>
        : never)
    | ('rowPinningFeature' extends keyof TFeatures
        ? Table_RowPinning<TFeatures, TData>
        : never)
    | ('rowSelectionFeature' extends keyof TFeatures
        ? Table_RowSelection<TFeatures, TData>
        : never)
    | ('rowSortingFeature' extends keyof TFeatures
        ? Table_RowSorting<TFeatures, TData>
        : never)
  > &
  Table_Plugins<TFeatures, TData>
```

This was a problem for type-checking performance. Every branch is its own conditional type, so a single evaluation of `Table` meant fourteen conditional instantiations, a union, and a `UnionToIntersection` pass that creates a function type per member. And it doesn't get evaluated once. It gets evaluated for every distinct `(TFeatures, TData)` pair the compiler encounters, and inside a library where every internal function is generic over both, that happens constantly. The column, row, cell, header, options, and state types each had their own copy of this same hand-written block, and because every copy was anonymous, none of the work was shareable or cacheable between them.

To put a number on it, we checked out V8 and ran the same measurement against its core source with the same compiler:

| `table-core` source only (TypeScript 6.0.3) |                               Instantiations |
| ------------------------------------------- | -------------------------------------------: |
| v8.21.3                                     |                                       78,054 |
| v9 alpha.54                                 | <span style="color:#ef4444">1,144,560</span> |
| v9 beta.12                                  |   <span style="color:#22c55e">158,636</span> |

We expected V8 to be cheap since its types never had to compute anything, and it was: 78k instantiations is close to the floor for a library this size. The V9 alpha was <span style="color:#ef4444">**14.7×**</span> that. All the new type capability, paid for in full, on every check, in every editor session. Beta.12 brings it down to <span style="color:#f59e0b">**2.0×**</span> V8, while inferring per-table feature APIs, per-table fn registries, typed meta slots, and plugin merging that V8 didn't offer. We think that is a fair price for what the types now do. 14.7× was not.

## How We Measured Type Performance

Editor lag is mostly the TypeScript language service doing the same work `tsc` does, on demand, in whatever file you're editing. So instead of guessing, we tracked the same metric the compiler tracks.

That metric that we measured was `Instantiations` from `tsc --extendedDiagnostics`: the number of times the compiler had to stamp out a generic type with concrete arguments. Unlike check times, this is deterministic. We used `tsc --generateTrace` to find where the work was happening. This is the same approach we used in our [TanStack Router TypeScript performance work](./tanstack-router-typescript-performance).

One nuance worth flagging: we optimized against `tsc`, the compiler and language service nearly everyone runs today, where fewer instantiations is reliably better and the most stable number to chase. The upcoming Go-based [`tsgo` (TypeScript 7)](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-beta/) checks types in parallel across independent workers that can duplicate shared work, so widely-referenced types may be instantiated once per worker and total count may map less directly to wall-clock time there.

## The Results

We measured at several points over the past week.

All values in the tables below are TypeScript type instantiations as reported by `tsc --extendedDiagnostics`.

_Lower is better._

| Benchmark                                    |                                     alpha.54 |                                    beta.10 |                                    beta.12 |                            alpha.54 → beta.12 |
| -------------------------------------------- | -------------------------------------------: | -----------------------------------------: | -----------------------------------------: | --------------------------------------------: |
| `@tanstack/table-core` `tsc --noEmit`        | <span style="color:#ef4444">1,230,007</span> | <span style="color:#f59e0b">494,577</span> | <span style="color:#22c55e">266,723</span> | <span style="color:#22c55e">**−78.3%**</span> |
| `@tanstack/table-core` declaration emit      | <span style="color:#ef4444">1,146,896</span> | <span style="color:#f59e0b">385,702</span> | <span style="color:#22c55e">161,432</span> | <span style="color:#22c55e">**−85.9%**</span> |
| `@tanstack/react-table` `tsc --noEmit`       |   <span style="color:#ef4444">235,498</span> |  <span style="color:#f59e0b">73,690</span> |  <span style="color:#22c55e">54,442</span> | <span style="color:#22c55e">**−76.9%**</span> |
| `examples/react/kitchen-sink` `tsc --noEmit` |   <span style="color:#ef4444">221,006</span> |  <span style="color:#f59e0b">85,839</span> |  <span style="color:#22c55e">74,583</span> | <span style="color:#22c55e">**−66.3%**</span> |

And of course, this is not a react-only story. Every framework adapter improved:

| Adapter package           |                                   alpha.54 |                                   beta.12 |                            alpha.54 → beta.12 |
| ------------------------- | -----------------------------------------: | ----------------------------------------: | --------------------------------------------: |
| `@tanstack/angular-table` | <span style="color:#ef4444">276,299</span> | <span style="color:#22c55e">49,813</span> | <span style="color:#22c55e">**−82.0%**</span> |
| `@tanstack/lit-table`     | <span style="color:#ef4444">192,656</span> | <span style="color:#22c55e">44,066</span> | <span style="color:#22c55e">**−77.1%**</span> |
| `@tanstack/preact-table`  | <span style="color:#ef4444">221,090</span> | <span style="color:#22c55e">41,420</span> | <span style="color:#22c55e">**−81.3%**</span> |
| `@tanstack/react-table`   | <span style="color:#ef4444">235,498</span> | <span style="color:#22c55e">54,442</span> | <span style="color:#22c55e">**−76.9%**</span> |
| `@tanstack/solid-table`   | <span style="color:#ef4444">198,164</span> | <span style="color:#22c55e">28,637</span> | <span style="color:#22c55e">**−85.6%**</span> |
| `@tanstack/svelte-table`  | <span style="color:#ef4444">168,534</span> | <span style="color:#22c55e">29,303</span> | <span style="color:#22c55e">**−82.6%**</span> |
| `@tanstack/vue-table`     | <span style="color:#ef4444">244,756</span> | <span style="color:#f59e0b">92,747</span> | <span style="color:#22c55e">**−62.1%**</span> |

Every kitchen-sink example we can measure improved between 36% and 79%, including the heavyweight variants built on Material UI, Mantine, and shadcn. Down below, we'll cover how we were able to achieve these results.

## How we improved type performance

Four changes account for most of the gains.

### Feature maps and `UnionToIntersection`

The biggest family of wins all came from one rule: don't make the compiler recompute something you can write down as a named type.

You saw both halves of this change above. The fourteen-branch union was in the alpha. The feature map ended up being the fix. The feature-to-type mapping moved into a plain named interface, and the selection logic moved into one small helper that every type family shares:

```ts
export type ExtractFeatureMapTypes<
  TFeatures extends TableFeatures,
  TFeatureMap extends object,
> = UnionToIntersectionOrEmpty<
  TFeatureMap[Extract<keyof TFeatures, keyof TFeatureMap>]
>
```

The interface costs almost nothing to instantiate because the compiler resolves its members lazily, and indexing it with the registered keys replaces fourteen hand-written conditionals with a single one. Just as important, the map is a real named type now: plugins declaration-merge their own entries into it, which is what made the V9 plugin system fall out of this refactor almost for free. We made the same change across the options, state, column, row, cell, and header types, added inference guard tests so later optimizations couldn't quietly break the public API, and the core went from 1.23M instantiations to 495k by beta.10.

We then came back for the rest of it. `ExtractFeatureMapTypes` still relies on `UnionToIntersection` internally, and that helper is expensive by nature. It leans on two of TypeScript's deeper rules at once. First, a naked type parameter in a conditional distributes over a union, so the helper turns the union of feature types into a union of function types, one per member. Then it exploits contravariance: function parameters are matched contravariantly, so when the compiler infers a single parameter type out of a union of function types, it is forced to combine the members into an intersection rather than a union. Wrapping each member in a function parameter is purely a trick to make that happen. The result is correct, but it means a function type gets created per member every time the helper runs, and none of it caches when the union's identity varies with `TData`. For the public `Table` and `TableOptions` types that cost is unavoidable, since the selected features genuinely depend on `TFeatures`. But our internal "broad" options type was running it over all thirteen stock feature option interfaces for every `(TFeatures, TData)` pair, and the stock features are known ahead of time. There is no reason to make the compiler compute an intersection that we can write out by hand:

```ts
export type TableOptions_All<
  TFeatures extends TableFeatures,
  TData extends RowData,
> = TableOptions_Core<TFeatures, TData> &
  Partial<
    TableOptions_ColumnFiltering<TFeatures, TData> &
      TableOptions_ColumnGrouping &
      /* ...the other eleven... */
      TableOptions_PluginFeatureMapTypes<TFeatures, TData>
  >
```

The one place `UnionToIntersection` still earns its keep is with plugins, since plugin keys are declaration-merged in by user code and can't be written out ahead of time. That last type in the intersection handles them, behind a guard that resolves to `unknown` when no plugins are merged:

```ts
type TableOptions_PluginFeatureMapTypes<TFeatures, TData> =
  [Exclude<keyof TableOptions_FeatureMap<TFeatures, TData>, StockKeys>] extends [never]
    ? unknown
    : UnionToIntersection</* plugin entries only */>
```

If you don't use plugins, the expensive path never runs. If you do, you pay for your plugin keys and nothing else. We verified the plugin flow against our custom-plugin example, which merges its own options in and reads them back through this exact type.

One sharp edge before moving on, because the "name everything" rule has a limit and we hit it. Splitting the feature maps into "static" and "data-dependent" halves so the static half could cache better seemed like an obvious next step. It made things worse, by 28,357 instantiations. A named type is only a cache point if it gets used from multiple places with the same arguments. Wrapping a conditional that still varies per call site in another named layer just adds instantiations. The hand-written intersection above works precisely because it removed the computation; it didn't rename it. We measured the split, reverted it, and kept the numbers in the log.

### Making Custom Internal Types an Interface

Profiling beta.10 with `tsc --generateTrace` was surprising: 77% of the core's remaining cost was the library checking itself. Hundreds of internal generic functions pass the table to each other, and every one of those calls related two instantiations of `Table_Internal`, our internal table type, which is only supposed to be used internally in the library. It was defined as the public conditional type plus some internal fields:

```ts
export interface Table_Internal<
  TFeatures extends TableFeatures,
  TData extends RowData = any,
>
  // core table interfaces only: no feature APIs, no conditional
  extends
    Omit<
      Table_Table<TFeatures, TData>,
      '_rowModels' | '_rowModelFns' | 'options' | 'initialState' | 'store'
    >,
    Table_Columns<TFeatures, TData>,
    Table_Rows<TFeatures, TData>,
    Table_RowModels<TFeatures, TData>,
    Table_Headers<TFeatures, TData> {
  // those omitted slots, redeclared as their broad all-features variants
  options: TableOptions_All<TFeatures, TData> & {
    /* state, atoms */
  }
  initialState: TableState_All
  _rowModels: CachedRowModel_All<TFeatures, TData>
  // ...store, atoms, _rowModelFns
}
```

Since `Table<TFeatures, TData>` contains the feature-map conditional, every internal call site re-expanded it. The single biggest type-creation site in the entire program was the function types that `UnionToIntersection` distributes, and `Table_Internal` was the reason.

The large improvement came from noticing that internal code doesn't need the feature-conditional view at all. Internally we already follow a "broad" convention (`TableState_All`, `CachedRowModel_All`, and friends) where every feature's slice is present regardless of registration. So we redefined `Table_Internal` as an interface that extends only the core table interfaces (columns, rows, headers, row models, and the base table properties) and redeclares its handful of internal slots (`options`, `initialState`, `store`, `atoms`, the row models) in their broad `*_All` forms. No feature-map conditional, statically known members, and a stable identity the compiler can relate without re-expanding the feature union each time. The public `Table` type is untouched, so nothing changes about the inference you write against.

The table-core package dropped another 40% in instantiations. Declaration emit dropped 48%... but the react adapter got twice as slow. We'll discuss that issue next.

### Variance annotations

Now, about that react adapter doubling. The package check went from 74k to 136k instantiations when `Table_Internal` became an interface. Same core types, opposite result, and the explanation taught us more about the compiler than anything else in this effort.

When TypeScript relates `SomeInterface<A>` to `SomeInterface<B>`, it wants to skip the member-by-member comparison and just compare `A` to `B`. To do that, it needs to know the variance of each type parameter, and it normally figures that out by probing the type's structure. But when a type parameter flows into conditional types, which `TFeatures` does everywhere, that measurement comes back marked unreliable. The compiler then falls back to comparing the full structure. The react adapter's hook layer creates a lot of fresh generic contexts, so it was paying the full expansion of `Table_Internal` over and over. As best we can tell, the old alias had sidestepped this without our intending it, because a deferred conditional type relates more lazily than an interface whose members are fully materialized.

A large improvement came from looking at how TanStack Form and TanStack Router already annotate their big generic interfaces this way (`FieldApi` in Form carries 46 of these):

```ts
export interface Table_Core<
  in out TFeatures extends TableFeatures,
  in out TData extends RowData,
>
```

`in out` declares the parameter invariant, and it is not a cache. It changes no behavior here, because these parameters already appear in both input and output positions throughout, so they were invariant in practice anyway. One subtlety worth being precise about: the compiler does validate variance annotations, but it lets you declare a parameter _more_ restrictive than its structure requires, and invariant is the most restrictive there is. So an `in out` annotation always passes that check, whatever the structure looks like, and the compiler uses the declared invariance instead of probing the structure to derive its own. That is safe, because narrowing a parameter to invariant can only remove assignments the compiler would otherwise have allowed, never introduce an unsound one. The cost shows up elsewhere, as the `TValue` experiment below illustrates: a relation you remove this way might be one your code actually relied on. What the annotation buys is a shortcut. The compiler relates instantiations by their type arguments directly, with no variance probing and no structural fallback.

Annotating `Table_Internal` alone took the react adapter from 136k down to 66k, below where it started. Annotating the rest of table-core's generic interfaces (166 parameters in total) took it to 54.7k, shaved another 3% off the core, and moved the kitchen-sink example from flat to 13% better. What had looked like a core-versus-adapters trade-off became a win everywhere, for the price of two keywords per type parameter.

One caveat from the same experiment, because variance annotations are not free everywhere. We tried annotating `TValue`, the cell value parameter, and the build broke immediately. `TValue` is genuinely covariant in output-position types, and forcing it invariant rejected the `Column<TF, TD, string>` to `Column<TF, TD, unknown>` widening that both the library and your apps rely on. The annotation itself was accepted, exactly as the "invariance is always safe" rule predicts. What it removed was a relation we actually needed, and the build caught it. So the rule of thumb is to only annotate parameters that are invariant in practice, and to treat a failing build as the check the annotation does not do for you. Measure, don't assume.

### Explicit type arguments in the adapter hooks

With the core fast, the profiler pointed at one last pattern, and it was in our own adapters. Every hook that builds a table did some version of this:

```ts
const table = constructTable({
  ...tableOptions,
  features: { coreReactivityFeature: reactivity(), ...tableOptions.features },
})
```

That spread creates an anonymous object type, and that triggers the expensive half of the compiler's work: type inference. With no explicit type arguments, TypeScript has to infer `TFeatures` and `TData` back out of the shape of that anonymous object before it can do anything else, and that inference algorithm is far more involved than a plain comparison. In react's case that one expression accounted for roughly 740ms of traced check time. The fix is one line:

```ts
const table = constructTable<TFeatures, TData>({
  /* same object */
})
```

Passing the type arguments explicitly removes the inference step entirely. With `TFeatures` and `TData` already known, all the compiler has left is an assignability check: does this object match `TableOptions<TFeatures, TData>`? That is a cheap, direct comparison, and it is the difference between asking TypeScript to solve for the type parameters and simply telling it what they are. We found and fixed the same pattern in the angular and preact adapters, worth about 15% of each package's check. The lit, solid, svelte, and vue adapters already passed alias-typed variables and didn't need the change. If you maintain a library with construction helpers like this, this audit takes five minutes and is worth doing.

## What this means for you

If you are using TanStack Table in your app, you shouldn't need to think about any of these topics. This is supposed to be a concern of the library authors. It's our goal to provide a library that doesn't come slow out of the box, giving you tons of room to use the library to its full potential.

If you are making a wrapper library or shared package around TanStack Table, you might consider the above advice as useful.

If you tried the V9 alphas and felt the editor drag, I encourage you to try the newest beta. A full type-check of a real app's tables runs in about half the time it did in the alpha, the language service does a fraction of the work when you hover a `table.` or edit a column def, and nothing about the inference you write against has changed. Feature selection, per-table fn registries, typed meta, and plugins are all still fully inferred, now at 2.0× the type cost of V8's fixed table instead of 14.7×.

For library authors doing heavy generics, the short version of our findings:

1. Measure `Instantiations`. It is deterministic, and `--generateTrace` tells you where to look.
2. Named types are only cache points when their arguments repeat. Wrapping a per-call-site conditional in more named layers makes things worse.
3. Interfaces beat conditional-intersection aliases for hot internal types, but only if the compiler can relate them by their type arguments, which leads to:
4. Annotate invariant type parameters with `in out` where possible. If your generics touch conditional types, the compiler's variance measurement goes unreliable and you silently pay structural fallbacks. This was the highest leverage-per-character change we made.

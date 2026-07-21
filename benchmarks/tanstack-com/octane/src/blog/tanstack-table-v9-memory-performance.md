---
title: How an Underrated Refactor Saved 90% Memory Usage
published: 2026-06-22
excerpt: TanStack Table V9 can use dramatically less memory than Table V8 in large tables because row, column, cell, and header APIs now live on shared prototypes instead of every object instance.
library: table
authors:
  - Kevin Van Cott
---

![TanStack Table V9 - Memory Performance](/blog-assets/tanstack-table-v9-memory-performance/header.png)

Up to 90% less memory usage in TanStack Table V9 compared to TanStack Table V8? Yes! For large tables at least.

How did we achieve this? Or how was there this much room to improve to begin with?

TanStack Table V9 has a lot of architectural changes for the better: a state management system overhaul and a new feature/plugin system with a much smaller "only pay for what you use" runtime model.

But one of the largest performance wins during the development of Table V9 came from a more subtle behind-the-scenes refactor. This refactor resulted in TanStack Table V9 using **up to ~90% less memory** than Table V8 for large tables when needing to process hundreds of thousands or millions of rows, either paginated or virtualized.

This improvement is either a big deal or one that barely matters, depending on how you want to use TanStack Table. In Table V8, depending on a large number of factors, you could only expect TanStack Table to be able to handle about 1 million (1.5 million at most) rows before running into memory issues in the browser (which is often the 4GB mark). With Table V9, the maximum number of rows that TanStack Table can handle before using 4GB of memory is now 10-16 million rows according to our benchmarks. Though note, that depending on how complex your web page is, you will most likely run into issues below these optimistic numbers, but this is up to a 10x improvement in the scalability of TanStack Table itself.

Should you be fetching or otherwise asking TanStack Table to handle 15 million rows client-side in the browser? Well, usually not, though we have seen use-cases that are not that "far-fetched". 😉

In this article, we'll go over our benchmark results, and then the details of how we achieved this performance improvement. It was surprisingly a simple refactor that had almost no downsides (besides 1 breaking change). There are probably many libraries out there that could be using this same pattern to improve their own memory usage, if they are not already.

## The Results

![chart showing the memory usage of TanStack Table V8 and Table V9 across paginated rows, virtualized rows, virtualized columns, and kitchen sink examples](/blog-assets/tanstack-table-v9-memory-performance/charts.png)

The charts above show that as the number of cells (rows x columns) that TanStack Table is asked to process (not just render) grows, the memory usage differences between Table V8 and Table V9 become much more pronounced. On the left of the graph, the difference is negligible, but on the right, Table V9 uses more than **2.4 GB less retained JS heap** than Table V8 when processing 1 million rows x 8 columns.

Here are the full benchmark results:

| Benchmark Example   | # of Cells (rows x columns) | Table V8 Memory Used | Table V9 Memory Used | Memory Saved | Percentage Improvement |
| ------------------- | --------------------------: | -------------------: | -------------------: | -----------: | ---------------------: |
| paginated rows      |                 80 (10 x 8) |              1.93 MB |              1.91 MB |      0.02 MB |                   1.0% |
| paginated rows      |           8,000 (1,000 x 8) |              4.71 MB |              2.22 MB |      2.49 MB |                  52.9% |
| paginated rows      |       800,000 (100,000 x 8) |            272.58 MB |             27.28 MB |    245.30 MB |                  90.0% |
| paginated rows      |   8,000,000 (1,000,000 x 8) |           2710.06 MB |            257.19 MB |   2452.87 MB |                  90.5% |
| virtualized rows    |                 80 (10 x 8) |              2.13 MB |              2.10 MB |      0.03 MB |                   1.4% |
| virtualized rows    |           8,000 (1,000 x 8) |              5.16 MB |              2.68 MB |      2.48 MB |                  48.1% |
| virtualized rows    |       800,000 (100,000 x 8) |            273.42 MB |             28.12 MB |    245.30 MB |                  89.7% |
| virtualized rows    |   8,000,000 (1,000,000 x 8) |           2714.32 MB |            261.46 MB |   2452.86 MB |                  90.4% |
| virtualized columns |               100 (10 x 10) |              2.24 MB |              2.24 MB |      0.00 MB |                   0.0% |
| virtualized columns |          10,000 (100 x 100) |              5.31 MB |              3.83 MB |      1.48 MB |                  27.9% |
| virtualized columns |       100,000 (100 x 1,000) |             25.82 MB |             10.73 MB |     15.09 MB |                  58.4% |
| virtualized columns |    1,000,000 (100 x 10,000) |            230.47 MB |             80.24 MB |    150.23 MB |                  65.2% |
| kitchen sink        |                 80 (10 x 8) |              2.18 MB |              2.38 MB |     -0.20 MB |                  -9.2% |
| kitchen sink        |           8,000 (1,000 x 8) |              4.96 MB |              2.79 MB |      2.17 MB |                  43.8% |
| kitchen sink        |       800,000 (100,000 x 8) |            272.83 MB |             36.91 MB |    235.92 MB |                  86.5% |
| kitchen sink        |   8,000,000 (1,000,000 x 8) |           2710.31 MB |            349.22 MB |   2361.09 MB |                  87.1% |

Overall, as the number of rows scale up, the memory usage savings scale up as well in a very consistent way.

Most of these example benchmarks are bare minimum examples that only implement one or two features like pagination or sorting, but the kitchen-sink example is supposed to be our more realistic example that uses all of the features that TanStack Table has to offer.

One thing worth pointing out is that in the kitchen sink example case that only has 10 rows x 8 columns, Table V9 is actually using slightly more memory than Table V8. This is most likely because we've done some work to add even more internal memoization for CPU performance gains. But the increase in memory usage from those improvements is so low that this other refactor dwarfs it. We essentially unlocked a huge new budget for memory usage that we didn't have before, and that budget grows with the number of table-created objects. We can feel a bit more free to optimize for speed at the cost of a little more memory usage going forward.

## How We Measured Memory Usage

If you're curious about how these benchmarks were run, you can view the repository [here](https://github.com/KevinVandy/tanstack-table-benchmarks).

The benchmark runner uses Playwright and the Chrome DevTools Protocol. For each example, it:

1. Builds the Vite example for production
2. Starts `vite preview`
3. Opens the page in a fresh Chromium context
4. Waits for the table to report that it is ready
5. Forces garbage collection with `HeapProfiler.collectGarbage`
6. Records retained JS heap
7. Records DOM counts and rendered row/cell counts
8. Scrolls or paginates the table when the example has an interaction to measure

This benchmark is designed to stress the thing that changed: the number of row, column, cell, and header objects that TanStack Table creates.

## The Refactor

Let's get into how we achieved this performance improvement.

The big reveal: We used shared prototypes... and that's pretty much it. Let's go over the details.

### What Table V8 Did

In TanStack Table V8, when the `table`, `row`, `column`, `cell`, `header`, etc. objects get created, both their values and methods were assigned directly to each object instance.

Simplified a bit, constructing a new `row` object looked like this:

```ts
const row = {
  // values
  id,
  index: rowIndex,
  original,
  depth,
  parentId,
  _valuesCache: {},
  _uniqueValuesCache: {},

  // methods
  getValue: (columnId) => {
    // ...
  },
  getUniqueValues: (columnId) => {
    // ...
  },
  renderValue: (columnId) =>
    row.getValue(columnId) ?? table.options.renderFallbackValue,
  getLeafRows: () => flattenBy(row.subRows, (d) => d.subRows),
  getParentRow: () =>
    row.parentId ? table.getRow(row.parentId, true) : undefined,
  getAllCells: memo(/* ... */),
  _getAllCellsByColumnId: memo(/* ... */),
  // maybe a dozen other methods from features ...
}
```

That is a very natural way to write JavaScript. For normal application code, I wouldn't expect it to be written any other way. The issue is that in TanStack Table, this code might be inside of a loop that creates thousands or millions of rows. And each row has its own loop that creates perhaps dozens or hundreds of cells.

So you end up in a situation where there are potentially millions of object instances that all have their own copy of the same methods over and over again. Millions of nearly identical `cell` and `row` objects. Potentially dozens or hundreds of nearly identical `column` and `header` objects.

And the cost is not just the duplicate function objects. In this style, every arrow function can also carry a closure scope with it. That closure might capture the `row`, the `table`, caches, options, or other local values from the factory that created the object. Those closure scopes are retained per instance too, which is a big part of why the memory usage can scale so aggressively.

### What Table V9 Does Instead

During the development of the TanStack Table V9 alpha, we introduced this refactor when creating every `row`, `column`, `cell`, and `header` object.

```ts
function getRowPrototype(table) {
  // Only create this row prototype once and cache it on the table instance
  if (!table._rowPrototype) {
    // create the row prototype object
    table._rowPrototype = { table }

    const features = Object.values(table._features)
    for (let i = 0; i < features.length; i++) {
      // create the methods for the row prototype - row.getValue(), row.getUniqueValues(), etc.
      features[i]!.assignRowPrototype?.(table._rowPrototype, table)
    }
  }

  return table._rowPrototype
}

// This code is in a loop that creates thousands or millions of rows
export const constructRow = (
  table,
  id,
  original,
  rowIndex,
  depth,
  subRows,
  parentId,
) => {
  // grab already made row prototype to get the methods
  const row = Object.create(getRowPrototype(table))

  // only assign unique values for this row
  row._uniqueValuesCache = {}
  row._valuesCache = {}
  row.depth = depth
  row.id = id
  row.index = rowIndex
  row.original = original
  row.parentId = parentId
  row.subRows = subRows ?? []

  return row
}
```

So instead of creating every `row.getValue()`, `row.getUniqueValues()`, etc. method for each `row` object potentially millions of times, we create them just once and then assign them to the `row` prototype, and then just assign the prototype to the new `row` object.

This also eliminates those per-instance method closures. The shared prototype method receives the specific row through `this`, so the row-specific state stays on the row object instead of being captured by a new function scope for every row.

We repeated this pattern for `column`, `cell`, and `header` objects too, though the largest impact was on the `row` objects, since those are the most likely to both scale and have a large amount of methods on them. We did not need to use prototype methods for the `table` object, because the `table` is already just 1 object instance.

### Why Not Use JavaScript Classes?

A natural question here is: why not just create `Row`, `Column`, `Cell`, and `Header` classes and put the methods there?

For a normal library, that would make a lot of sense. JavaScript class methods already live on the class prototype, so a `class Row { getValue() {} }` implementation could get many of the same memory benefits as this refactor, as long as we did not use class fields or constructor-assigned arrow functions for the methods.

The problem is that TanStack Table V9's APIs are dynamically composed from features. We only want `row.getVisibleCells()` to exist if the column visibility feature is registered. We only want `column.toggleSorting()` to exist if the row sorting feature is registered. The same idea applies across rows, columns, cells, headers, and custom plugin APIs.

Trying to model that with classes would get awkward quickly. JavaScript classes have single inheritance, but TanStack Table's feature system is closer to conditional multiple inheritance. A table might use sorting, filtering, pagination, column visibility, row selection, pinning, grouping, and a custom plugin. Another table might use only sorting. Another might use a totally different combination.

You could imagine building a chain of mixins like:

```ts
Row = withSorting(withColumnVisibility(withPagination(BaseRow)))
```

But then every feature needs to participate in class composition, ordering becomes more fragile, and custom plugins have to extend the right class shape at the right time. It is possible, but it is not simpler.

The manual prototype approach gives us the part we actually want from classes, shared prototype methods, while keeping the feature system dynamic:

Each table gets prototypes that contain exactly the APIs for the features it registered. That is the important part for the tree-shakable runtime model, and it is much cleaner than trying to force every possible feature combination through class inheritance.

### Why Not Do This in Table V8?

There was an original [PR](https://github.com/TanStack/table/pull/5927) from [Michael Leibman](https://github.com/mleibman-db) that proposed this kind of refactor for TanStack Table V8. However, we discovered that this technically introduces subtle breaking changes. So we decided that this would be less risky to implement in Table V9 instead.

What are those subtle breaking changes? Mainly destructuring object methods doesn't work anymore.

Code like this breaks:

```ts
const { getValue } = row

const value = getValue('name')
```

You have to use the method like this:

```ts
const value = row.getValue('name')
```

This worked in Table V8 because methods like `getValue` were arrow functions created inside the row factory. They closed over the `row` object, so they did not care how they were called.

In Table V9, the method is shared on the row prototype and uses its `this` context to know which row it is operating on. When you destructure a method like this, you get the function, but you lose the original receiver. Then `this` is `undefined` in strict mode, so the method cannot find the row. That strict-mode behavior applies automatically here because ES modules are always strict, and TanStack Table ships as modules.

The methods won't appear as own properties (e.g. in Object.keys(row), object spread, or JSON.stringify). They live on the prototype, though you'll still find them under [[Prototype]] in the console. This also means shallow clones like `{ ...row }` will copy row data but drop the object's methods.

```ts
console.log(row)
// { id, index, original, depth, parentId, _valuesCache, _uniqueValuesCache }
```

But you can still call the methods all the same. Calling `row.getValue()` still works because JavaScript will automatically look for the method on the prototype if it is not found on the object itself.

This is a tradeoff worth making in a breaking change release, especially if it is the only downside, but we couldn't push this change out into Table V8.

## Final Thoughts

This is definitely a refactor worth making for a library like TanStack Table. I wonder how many other libraries or even applications out there could benefit from this same optimization when needing to scale. We definitely thought that it was worth sharing here in case it is useful for you.

If you are wondering what this means for you as a user of TanStack Table, hopefully this is just an invisible improvement that you'll barely notice. We will be documenting the small breaking changes in the migration guide for Table V8 to Table V9.

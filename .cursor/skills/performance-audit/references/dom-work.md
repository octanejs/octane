# DOM work without forced layout

The commit is meant to be write-only. Rendering writes the DOM; geometry is read
in layout effects, in a batched measure phase, or after paint. Cite symbols, not
line numbers: `runtime.ts` moves daily.

## Forced synchronous layout

- After any DOM or style write in the current task, reading geometry forces the
  browser to recalculate style and run layout before it can answer. Geometry
  reads include `offset*`, `client*`, `scroll*`, `getBoundingClientRect()`,
  `getClientRects()`, layout-dependent `getComputedStyle()` values, `innerText`,
  `scrollIntoView()`, `elementFromPoint()`, and `focus()`. Alternating reads and
  writes in a loop forces one layout per iteration: layout thrash.
- Read everything first, then write everything. `vtMeasureElements` in
  `runtime.ts` measures every ViewTransition participant in one loop before any
  name or style is applied. A layout effect that measures and then updates state
  should measure every target, then update once.
- Never read geometry in the render walk or per node. The ViewTransition stage
  keeps geometry, scrolling, selection, and resource readiness reading the
  committed host while writes are prepared (`dom-stage.ts`,
  `PROJECTED_PROPERTIES`). `scripts/check-staged-dom.mjs` lists those native
  reads in `NATIVE_READS` and fails on an unclassified native operation in
  `runtime.ts`.
- `getComputedStyle()` after a style write forces a style recalculation even for
  values that need no layout. Read it before writing, or once per commit.

## Batch writes

- Build new subtrees detached and insert each once. A compiled template's HTML is
  parsed once through a `<template>` element (`template()` and `parseTemplate`),
  each mount calls `clone()`, and the binding-bag factory inserts the root before
  the block's end marker in one call. Do not replace that with per-node
  `createElement` plus `setAttribute` on a hot path.
- Set a class or style once per commit with its final value. Do not toggle
  through intermediate values in one render.
- Shared helpers that walk any node use cached native accessors
  (`getFirstChild`, `getNextSibling`), and absent expandos are seeded on
  `Element.prototype` so misses stay fast (`initDomOperations`). See
  `v8-shapes.md` for why.
- jsdom has no layout, so it reports zero geometry and cannot show thrash.
  Changes to DOM write counts show up in the pull request benchmark gate, which
  fails on any increase in js-framework DOM mutations per operation.

## Events are native and delegated

- Each event type gets one listener per root or portal target, added by
  `delegateEvents` and dispatched by `dispatchDelegated`. Handlers live in
  `$$<type>` expandos. Do not add per-element listeners on a hot path, and do not
  add a synthetic event layer.
- Enter/leave and scroll events are target-only (`TARGET_ONLY_DELEGATED`).
  `touchstart` and `touchmove` are registered with `passive: false`
  (`delegatedListenerOptions`) so handlers can call `preventDefault`. Changing
  listener options changes scroll performance and behavior, so it needs browser
  evidence.
- A discrete event flushes synchronously only when a controlled `value` or
  `checked` restore was armed (`maybeFlushDiscrete`). Every other handler update
  stays in the microtask batch. Do not add another synchronous flush per event.

## ResizeObserver

Native `ResizeObserver` callbacks run inside the browser's resize delivery loop.
A state update or DOM write there that resizes an observed target can trigger
`ResizeObserver loop completed with undelivered notifications`.
`createResizeObserver` in `resize-observer.ts` coalesces entries per target and
delivers them in a posted task (`docs/differences-from-react.md`, §Scheduler).
Use it, not a raw observer, in any runtime or binding code that writes from a
resize callback.

## requestAnimationFrame and after-paint work

- `requestAnimationFrame` callbacks run in the rendering steps of the next frame,
  **before** style, layout, and paint. A write there is painted in that same
  frame, and a read after a write there still forces layout. rAF is not
  "after paint" and not a yield.
- To run after paint, post a task from inside rAF. `schedulePostPaint` does
  exactly that: `requestAnimationFrame` posts a `MessageChannel` message, and the
  message drains the callbacks. Background tabs and occluded WebViews may never
  fire rAF, so it also arms one bounded timer per batch: 250 ms when visible,
  0 ms when hidden. Passive effects use it through `schedulePassiveFlush`.
- Do not build a second post-paint mechanism. Queue on `schedulePostPaint`, or
  extend it with evidence.

## Evidence

- **DOM mutations per operation:** the pull request benchmark gate
  (`.github/workflows/pr-bench.yml`) fails on any increase in js-framework DOM
  mutations or production calls per operation.
- **Forced layout:** a Chromium performance trace of the scenario showing no
  "Forced reflow" warnings in the changed code, or a Playwright run in
  `packages/octane/tests/browser/` (the `octane-events-browser` project).
- **User-visible latency:** Event Timing in Chromium; see `scheduling.md`.

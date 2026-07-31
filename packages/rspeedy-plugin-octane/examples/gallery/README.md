# Tutorial: Product Gallery (Octane on Lynx)

This example is a faithful port of the official Lynx tutorial
[“Tutorial: Product Gallery”](https://lynxjs.org/4.0/learn/gallery.html)
(`lynx-examples/examples/Gallery`, `GalleryComplete` step) from ReactLynx to
Octane's `@octanejs/lynx` renderer. It exercises the full tutorial feature set:

- a two-column **waterfall `<list>`** of image cards,
- a **like icon** per card (`bindtap` + `useState` + CSS ripple `@keyframes`),
- **auto-scroll** through a background element ref
  (`ref.current.invoke('autoScroll', …)`),
- a **custom scrollbar driven by main-thread scripting** — a `'main thread'`
  scroll handler updates a `main-thread:ref` element on every scroll frame
  without a background round trip.

## Run it

```bash
pnpm --filter @octanejs/rspeedy-plugin exec rspeedy dev --root examples/gallery
```

Scan the QR code (or `open` the printed `main.lynx.bundle?fullscreen=true` URL)
with Lynx Explorer 3.9+.

## What changes when porting from ReactLynx

The component structure and CSS carry over almost verbatim. The differences:

| ReactLynx | Octane |
| --- | --- |
| `.tsx`, explicit `return <jsx>` | `.lynx.tsrx`, `function C() @{ … }` render block |
| `{cond && <view/>}` | `@if (cond) { <view/> }` |
| `list.map(item => <list-item key=…>)` | `@for (const item of list; key item.id) { <list-item …> }` |
| `import { useState } from '@lynx-js/react'` | `import { useState } from 'octane'`; Lynx APIs from `@octanejs/lynx` |
| `column-count={2}` on `<list>` | `span-count={2}` (compiler-validated prop allowlist) |
| `ref.invoke({ method, params }).exec()` | `await ref.current.invoke(method, params)` (Promise-based) |
| `main-thread:ref` gives a `MainThread.Element` wrapper (`setStyleProperties`) | `main-thread:ref` gives the **raw PAPI element**; style it with the Element PAPI globals: `__AddInlineStyle(el, name, value)` + `__FlushElementTree()` |
| `"main thread"` directive string | `'main thread'` directive (same concept, compiled by Octane) |

`SystemInfo` is available as a bare global in both thread graphs (the
main-thread runtime bridges it from `lynx.SystemInfo`, matching ReactLynx).

## Verified on device (Lynx Explorer, iOS)

Side-by-side against the original `GalleryComplete.lynx.bundle`:

- waterfall layout, images, and like-icon rendering are visually identical;
- tapping a like icon flips the heart to red through a native `bindtap` →
  background `useState` update;
- `invoke('autoScroll')` starts native auto-scroll;
- the MTS scrollbar tracks scroll position with main-thread-only work.

Known limitation: a `<list>` in the initial tree is excluded from Octane's
first-screen capture (documented Milestone 6 exclusion), so this page renders
through the ordinary background path and reports one first-screen error in dev.
The Explorer error toast is expected; rendering and interactivity are
unaffected.

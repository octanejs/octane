# Tutorial: Product Detail — Swiper (Octane on Lynx)

This example ports the official Lynx tutorial
[“Tutorial: Product Detail”](https://lynxjs.org/4.0/learn/product-detail.html)
(`lynx-examples/examples/swiper`, final `EasingDefault` step) from ReactLynx to
Octane's `@octanejs/lynx` renderer. It is the high-performance-interaction
tutorial:

- a **custom swiper** driven entirely by main-thread scripting —
  `main-thread:bindtouchstart/move/end` update `translateX` on every frame with
  no background round trip;
- a release **snap animation** built on `requestAnimationFrame` in a
  `'main thread'` function, with a **custom easing function passed from the
  App as a prop across the thread boundary**;
- an **`<Indicator>`** kept in sync through `runOnBackground` (main → state
  setter) and dot taps jumping the swiper through `runOnMainThread`
  (background → worklet);
- `useMainThreadRef` cells for touch/offset/index state that lives only on the
  main thread.

## Run it

```bash
pnpm --filter @octanejs/rspeedy-plugin exec rspeedy dev --root examples/swiper
```

Open the printed `main.lynx.bundle?fullscreen=true` URL with Lynx Explorer 3.9+.

## What changes when porting from ReactLynx

| ReactLynx | Octane |
| --- | --- |
| `useOffset`/`useUpdateSwiperStyle`/`useAnimate` custom hooks in `.ts` files | thread functions live in `.lynx.tsrx` (the Octane compiler owns `'main thread'` / `'background only'` directives) |
| `containerRef.current.setStyleProperties({transform})` | `__AddInlineStyle(el, 'transform', …)` + `__FlushElementTree()` on the raw PAPI element |
| `runOnBackground(setCurrent)` — any function | background captures are **data-only**: subscribe the state setter through a module-scope binding and call a module-scope `'background only'` function |
| `animate({ easing, onUpdate })` — function-valued options across worklets | thread-function **arguments are data-only** too; the rAF loop is inlined into `handleTouchEnd` so its callbacks stay main-local closures. A captured easing descriptor hydrates to a callable, so the custom `easing` prop still works |
| nested `'main thread'` directive inside another | forbidden by the compiler; inner closures of a thread function are already main-local |

## Verified on device (Lynx Explorer, iOS, via lynx-devtool)

- drag moves the container in real time through the MTS handlers; release runs
  the 3 s eased snap; the indicator follows via `runOnBackground`;
- a `runOnMainThread(updateOffset)` jump from the background works
  (auto-advance smoke test);
- rendering matches the ReactLynx `EasingDefault` bundle side-by-side.

## Octane defect found (and fixed) by this port

This port originally rendered every slide beyond the first as black: elements
created during main-thread script evaluation bake in unconfigured PageConfig
defaults (`defaultOverflowVisible` above all), because native installs the
decoded PageConfig on the ElementManager only after evaluation
(`TemplateAssembler::DidVMExecute`). The translated `display: linear`
container therefore clipped everything outside its own bounds, and no later
style or attribute touch could recover the platform views. Fixed by deferring
the application first screen to the engine's `__RenderPage` lifecycle —
`firstScreenRender: 'engine'` (octanejs/octane#419); with that fix every slide
paints identically to the ReactLynx original.

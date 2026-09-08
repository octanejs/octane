# Upstream boundary

This directory is an adaptation of the `<lynx-view>` embedding logic in
[`@lynx-js/go-web`](https://github.com/lynx-community/go-web) 0.8.1, which is
Apache-2.0 licensed:

| Here | Upstream |
| --- | --- |
| `fit.ts` | `src/example-preview/utils/fit-scale.ts`, `src/example-preview/utils/number.ts` |
| `mode.ts` | `src/example-preview/utils/resolve-web-preview.ts` |
| `controller.ts` | `src/example-preview/components/web-iframe.tsx` |
| `auto-gesture.ts` | no upstream equivalent — new, and offered back |

```
Copyright The Lynx Authors and the go-web contributors.
Licensed under the Apache License, Version 2.0.
```

## Why it is a copy at all

`@lynx-js/go-web` publishes its `<Go>` component as React source. Its peer
dependencies are `react`, `react-dom`, `@douyinfe/semi-ui`, `swr` and
`qrcode.react`. This website is an Octane application.
[`ReactCompat`](https://octanejs.dev/docs/react-compat) can host React DOM
components inside it, but embedding the full `<Go>` component would still add
those dependencies and go-web's own UI. The DOM bridge does not provide the
ReactLynx renderer or native Lynx runtime for the application being previewed.
This adaptation keeps the embedding controller framework-neutral and the
surrounding UI native to this site.

The package's React-free entry point, `@lynx-js/go-web/embed`, resolves `embed.html`
relative to its own module URL, so it needs go-web's own built site to be served
alongside it — and the URL its README documents,
`https://go.lynxjs.org/embed.js`, currently 404s.

The chrome around the preview (file strip, code panel, tabs, QR code) is
written for this site and is deliberately not a port: it follows the Octane
site's design system.

The part in *this* directory is the opposite case. Getting `<lynx-view>` right
is fiddly and version-sensitive — `browserConfig` ordering, the fit/responsive
threshold with hysteresis, the container-relative `rpx`/`vw`/`vh` re-basing, and
the fact that there is no public "rendered" event so the page root inside the
shadow tree has to be observed instead. Reimplementing that from scratch would
diverge from go-web for no benefit.

## Upstream status

This directory has been sent back to go-web as
[lynx-community/go-web#79](https://github.com/lynx-community/go-web/pull/79),
which adds it there as a `@lynx-js/go-web/lynx-view` entry point — importing
go-web's own `fit-scale` and `resolve-web-preview` utilities instead of the
`fit.ts`/`mode.ts` copies here, which only exist because this side had nothing
to import. Once that lands and ships, this directory should be deleted and
`LynxPreview.tsrx` should import the published package instead.

Until then, changes made here need to be mirrored onto that branch.

## Upstream intent

This directory has no React import, no framework dependency and no dependency on
anything else in this repository. `mountLynxView(container, options)` owns a
subtree of plain DOM elements and reports state through a callback, and
`loadRuntime` is injected rather than chosen here.

That shape is deliberate: it is what go-web would need in order to expose this
as a framework-neutral entry point (something like
`@lynx-js/go-web/lynx-view`), with go-web's own `WebIframe` becoming a thin
React binding over it, exactly as `LynxPreview.tsrx` is a thin Octane binding
here. Changes made here should stay portable back to go-web — keep the DOM and
the state machine free of Octane, and keep the ported maths behaviourally equal
to upstream so a diff against it stays readable.

## Known divergences from upstream

- The overlay and its labels are not ported; this site renders its own status UI
  from `onStateChange`. Upstream's `onCanRefreshChange` callback is folded into
  that same state as `canRefresh`, which carries the same fact.
- The `?simulateError=` development hook is not ported.
- Upstream's static preview image and `<img>` cover path belong to its own
  chrome, not to the view, and are not ported.

### Behavioural fixes made here, worth sending back

Three things were found by embedding real tutorial examples. All three are
upstream bugs, not adaptation artefacts, and all three are fixed here.

1. **The fit path breaks `<list>`.** `fit` scales the view with a CSS
   `transform`, and web-core measures list cells through
   `getBoundingClientRect()`. Under a transform those measurements come back in
   visual pixels while the positions are written in layout pixels, so a
   waterfall list packs its cells by the scale factor and they overlap. With the
   Lynx Product Gallery tutorial at a 248 x 537 panel, the 10px gap between
   cells became a 35px overlap — exactly the 0.66 scale factor. The same
   coordinate mismatch applies to `main-thread:bindtouch*` handlers, which read
   `clientX` in visual pixels and write `translateX` in layout pixels.

   The default here is therefore `responsive` (which is also go-web's own
   documented default; `auto` resolves to `fit` for any panel narrower than a
   phone, which is nearly all of them). A caller that wants the authored
   viewport exactly should size the container to `designWidth`, where
   `responsive` maps `rpx` 1:1 with no transform at all.

2. **`pageRoot()` must skip the disposed root.** A reload does not replace the
   old page root: web-core marks it `l-disposed` and leaves it in the shadow
   tree. Upstream's `shadow.querySelector('[part="page"], [lynx-tag="page"]')`
   returns that dead node first, so the "has it painted" test can never observe
   the new page. This returns the first *live* root instead.

3. **`<lynx-view>.reload()` does not rebuild** on `@lynx-js/web-core@0.22.2`. It
   disposes the page — same root identity, `l-disposed` set — and nothing
   replaces it, so upstream's soft refresh leaves a dead tree on screen until
   its 5s fallback timeout hides the problem. `reload()` here recreates the
   element instead; the bundle comes from the HTTP cache, so it costs a rebuild
   rather than a download, and it settles in well under a second.

### `auto-gesture.ts` — new, and the most reusable piece here

A gesture-driven example cannot demonstrate itself in an embedded preview: the
Lynx Product Detail tutorial binds `touchstart`/`touchmove`/`touchend`, so a
desktop reader's mouse never reaches it and the carousel looks like a still
image. `playAutoGesture(host, { steps })` performs the gesture and draws the
contact point the way a device simulator does, so the preview shows what the
example is for.

It is deliberately the most framework-neutral file in this directory: no Lynx,
no Octane, no import from anything else here. It takes a host element and
fractional coordinates, so the same driver would work for a ReactLynx or Vue
Lynx example gallery, and for go-web itself.

Two details worth carrying over with it:

- **Dispatch pointer events as well as touch events.** Real touch input produces
  both, and web-core drives its gestures from the pointer stream — dispatching
  only `touchstart`/`touchmove`/`touchend` reaches the correct element, bubbles
  all the way to the document, and does nothing at all.
- **`isTrusted` is the right way to hand control back.** Synthesized events
  always report `false`, so the first real pointer or touch is unambiguous and
  stops the playback without any flag of our own.

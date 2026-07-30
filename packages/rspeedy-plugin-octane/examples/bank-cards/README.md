# Tutorial: Product Detail / Bank Cards (Octane on Lynx)

This example is a faithful port of the official Lynx tutorial
[“Tutorial: Product Detail”](https://lynxjs.org/4.0/learn/product-detail.html)
(`lynx-examples/examples/BankCards`, `final` step) from ReactLynx to Octane's
`@octanejs/lynx` renderer. It exercises:

- a payment sheet layout using Lynx **`display: linear`** CSS,
- a **`<scroll-view>`** of bank cards with per-row `bindtap` selection
  (check mark + card number swap),
- a **3D card flip** on “Pay Now” driven purely by CSS
  (`perspective`, `rotateY` `@keyframes`, `animation: … both`),
- image assets resolved through ordinary `import icon from './x.png'`.

## Run it

```bash
pnpm --filter @octanejs/rspeedy-plugin exec rspeedy dev --root examples/bank-cards
```

Scan the QR code (or `open` the printed `main.lynx.bundle?fullscreen=true` URL)
with Lynx Explorer 3.9+.

## What changes when porting from ReactLynx

| ReactLynx | Octane |
| --- | --- |
| `.tsx` components with `return` | `.lynx.tsrx` components with `@{ … }` render blocks |
| `<scroll-view scroll-y>` | `<scroll-view scroll-orientation="vertical">` |
| `className={`a ${cond ? 'b' : ''}`}` | `class={['a', cond ? 'b' : '']}` (clsx-style composition) |
| `{cond && <image …/>}` | `@if (cond) { <image …/> }` |
| SCSS files | plain CSS (same rules; the tutorial styles are flat already) |

The `dataUriLimit: 0` line in `lynx.config.mjs` emits icons as asset files
instead of inlined data URIs; Explorer 3.9's dev image-size warning fires for
every data-URI image (its threshold reports `-1`), and file URLs avoid the
noise.

## Verified on device (Lynx Explorer, iOS)

Side-by-side against the original `final.lynx.bundle`:

- first paint is rendered **synchronously by the Octane main-thread graph**,
  then adopted by the background runtime (`adoption=adopted` acknowledgement)
  with no visual change and no duplicate nodes;
- tapping a payment row moves the check mark and swaps the card number
  (background event on an adopted node → state → committed update);
- “Pay Now” flips the card to its CCV back face with the CSS keyframe
  animation;
- rendering is visually identical to the ReactLynx original.

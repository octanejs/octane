---
'octane': patch
---

Render each Block in its signal owner without re-entering the renderer.

With signals enabled, every Block renders in an owner of its own, so nearly every
render changes owner. `renderBlock` entered that owner through a callback frame
that called `renderBlock` again, which resolved the same owner a second time and
allocated a closure per render. It now enters the owner in place and restores the
caller's owner when the render returns, throws, or suspends. The in-place frame
is installed with the signal document, so apps that never enable signals do not
retain it. A host carrier installed with `installSignalOwnerEnvironment`, or a
root given a `signalOwner` without the signal document, still runs each Block
inside its own callback frame. A scope's resolved owner is also kept on the scope
instead of in a `WeakMap`, so each lookup is a field read and live Blocks no
longer occupy a weak table.

On the new `app-frame-hydration` benchmark (about 1,650 Blocks, 4× CPU throttle,
Chromium), `renderBlock` entries fall from two to one per render, production calls
fall by 4.0%, and hydration allocates 161 KB less. Paired with the previous
runtime, cold hydration is 1.8% faster and warm hydration 3.9% faster.

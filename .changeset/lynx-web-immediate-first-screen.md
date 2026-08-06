---
'@octanejs/rspeedy-plugin': patch
---

Render the first screen immediately on Lynx for Web instead of deferring it to the engine.

The generated main-thread entry hardcoded `firstScreenRender: 'engine'` for every platform. `engine` mode exists for native, where the engine installs the decoded PageConfig on the ElementManager only after script evaluation (`DidVMExecute`), so elements created during evaluation bake unconfigured overflow defaults and clip (#419). Lynx for Web has neither problem: `@lynx-js/web-core` never dispatches `__RenderPage`, and its renderer has no config-gated overflow default. Deferring there only couples the first screen to the background readiness handshake for no benefit — and turns any handshake failure into a fully blank screen instead of a painted-but-not-yet-interactive one.

The plugin now selects the mode per platform through a build-time define the entry reads: `engine` on native, `immediate` on web. On web the first screen paints during evaluation, decoupled from the handshake and more robust, with no visual change. Verified by mounting the swiper tutorial port through `@lynx-js/web-core` in Chromium: both modes render pixel-identically (no clipping, `overflow: visible`, same timing), so the switch is safe.

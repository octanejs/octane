---
'octane': patch
'@octanejs/stylex': patch
'@octanejs/vite-plugin': patch
---

Add opt-in native `sx` authoring with signal-aware StyleX arguments. Normal rendering and renderer-free bindings share a native projection that prepares class, style, and metadata together, preserves SSR adoption and source ownership, and skips unchanged DOM writes. StyleX remains responsible for style composition, units, and extracted CSS.

Expose a shared StyleX compiler contract and a TSRX type-check provider so supported native `sx` expressions can sample signal arguments without widening ordinary StyleX function parameters or component props. Forward native attribute contracts through the application Vite plugin.

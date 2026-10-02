---
'@octanejs/app-core': minor
'@octanejs/vite-plugin': minor
'@octanejs/rsbuild-plugin': patch
---

`new RenderRoute({ …, hydrate: 'islands' })` serves a route's server-rendered shell with a renderer-free bootstrap: the shell's module, layout and the renderer never load, and only the page's independent `<Hydrate>` islands activate. The shell's CSS still ships. The Vite build fails if the shell needs client work (hooks, handlers, refs, controlled values, ordinary `<Hydrate>`, `@try`, signal reads, spreads, unchecked components or root boundaries) or if the bootstrap or `preHydrate` hook reaches the renderer. The Rsbuild integration rejects the option for now.

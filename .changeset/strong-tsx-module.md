---
'octane': minor
'@octanejs/mcp-server': patch
---

Strong mode now compiles only `.tsrx`, `.ts`, and `.js` modules. A `.tsx` or `.jsx` module reports `OCTANE_STRONG_TSX_MODULE` when its own `"use strong"` directive or the application's `compiler.strong` setting reaches it, because its JSX lowers to element descriptors that render through the generic descriptor renderer instead of compiled templates. Rename the module to `.tsrx` and write its markup as template JSX, with keyed `@for` blocks in place of `.map()` lists. A module without JSX can stay `.ts` or `.js`, where `root.render(App, props)` renders an entry point. Installed dependencies keep their own mode.

`OCTANE_STRONG_ELEMENT_API` now applies to every Strong module. `collectDiagnostics` and `octane analyze --strong-preview` still list a `.tsx` module's other Strong findings next to the new code, so the conversion's remaining work shows up at once. The Strong migration recipes, the MCP server's recipes and skills, and the docs examples are written as `.tsrx`.

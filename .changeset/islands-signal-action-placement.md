---
'octane': patch
'@octanejs/vite-plugin': patch
---

Keep the signal Action frame and transition coordinator, about 4 KB gzip, out of islands-only pages. Only the renderer uses them, to hold back signal writes made inside a `startTransition` Action until it settles, so a page that loads signals without the renderer never runs them. Until now every bundle that loaded the signal graph also carried them.

Octane's package imports now choose where they live. By default they stay with the signal graph. A bundler that resolves with the `octane-islands` condition bundles them with the renderer instead. Both placements stage Action writes the same way, including for signals imported after an Action awaited. The condition only decides which pages download the code.

`@octanejs/vite-plugin` adds the condition to the production client build when every `RenderRoute` uses `hydrate: 'islands'`. Apps that also have fully hydrated routes keep the default.

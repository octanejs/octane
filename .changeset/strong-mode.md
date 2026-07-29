---
'octane': patch
'@octanejs/app-core': patch
'@octanejs/vite-plugin': patch
'@octanejs/rspack-plugin': patch
'@octanejs/rsbuild-plugin': patch
---

Add optional Strong mode for clearer state and ref behavior. Enable it across an
application with `compiler: { strong: true }`, in one module with `"use strong"`,
or through the Vite, Rspack, and Rsbuild plugin options. Strong modules reject
state updates during render, direct state updates while setting up an effect, and
render-time writes to refs, with `useLinkedState` available for state that
should follow another value.

---
'octane': patch
---

Fix Vite server builds that alias bare `octane` to the client entry, as checkout-pinned harnesses do. Vite applies `resolve.alias` before the plugin can route `octane` to `octane/server`, so a custom hook in a plain `.ts`/`.js` module ran the client runtime's hooks during `renderToString` and threw `Cannot read properties of null (reading 'hooks')`. Server transforms now name `octane/server` in plain modules, as compiled `.tsrx` output already did. Builds without such an alias produce the same output as before.

---
'octane': patch
---

Specialize production roots and component calls over `.tsx` components the way `.tsrx` components already are. Vite's TypeScript transform reprints every `.tsx` module after Octane compiles it, so the Vite plugin's check that an imported component still has the compiled code it proved never passed for `.tsx`. Every `.tsx` app therefore shipped the generic root and component paths, about 30 kB gzip more than the same app in `.tsrx`. The check now accepts a reprint that changes only positions, literal spellings and comments, and still falls back to the generic paths when a later transform changes the program.

---
'octane': patch
---

Production builds emit less code for inlined `useMemo` and `useCallback` calls. When the compiler supplied the memo's slot, the hook's name is no longer passed to the runtime, since only an authored slot can be missing. In plain `.ts` and `.js` modules, a dependency that is a never-reassigned local binding is now read directly instead of being copied to a temporary first. Across the repository's binding modules, this saves about 5.6 KB gzip, summed per module.

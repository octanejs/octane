---
'octane': patch
---

A universal renderer module that reads signals no longer imports `nativePuMemo` from `octane/internal/client` for its memoized creations. A `use()` creation or a `useMemo` with omitted dependencies now uses the renderer's own `useMemo`, so the DOM runtime stays out of non-DOM bundles. A DOM signals module whose warm plan only warms child components also stops importing the unused `nativeWarmMemo`.

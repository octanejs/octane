---
'@octanejs/redux': patch
---

Fix `useSyncExternalStoreWithSelector` calls that omit `isEqual` so the compiler's trailing hook slot is not interpreted as the optional comparator.

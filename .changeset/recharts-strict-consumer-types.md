---
'@octanejs/recharts': patch
---

Expose Recharts' public declaration surface to strict TypeScript consumers.

The package previously pointed its `types` and `exports` fields at the raw
TypeScript source entry, causing consumer programs to typecheck every internal
TSRX and vendored JavaScript module. The package now routes TypeScript through
its Octane-native public declarations while preserving the source runtime entry.

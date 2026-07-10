---
'octane': patch
---

compiler/vite: hand-slot-forwarding libraries are now self-declarative. A binding whose plain `.ts`/`.js` sources forward hook slots themselves declares `"octane": { "hookSlots": { "manual": ["src"] } }` in its own package.json, and the plugin's surgical hook-slotting pass skips files under the declared directories automatically (nearest-manifest lookup, cached per directory) — no more repeating `exclude` path lists in every Vite/Vitest config that aliases workspace sources. The scope is a directory list rather than the whole package so a binding's own test files stay auto-slotted. The `exclude` option remains as an ad-hoc escape hatch.

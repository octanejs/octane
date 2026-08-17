---
"octane": patch
---

Extend Strong-mode analysis through statically known `useCallback`, `useEffectEvent`, and memo-returned functions. Reject Effect Event calls during render and Effect Events in explicit hook dependency lists, while preserving supported hook usage and compatibility-mode behavior.

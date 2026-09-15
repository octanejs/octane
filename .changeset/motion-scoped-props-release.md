---
"@octanejs/motion": patch
---

Update the Motion engine to 13.2.0 and support scoped MotionConfig prop filtering with nested inheritance and overrides. Preserve native events, refs, styles, and existing compatibility imports, and strengthen the supported motion-value hook types.

Fix `useSpring` retaining its old source subscription when a component supplies a replacement MotionValue.

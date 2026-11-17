---
"octane": patch
---

Mount a component that renders itself through the same lite component scope as a call from another component. Since the lexical tag-shadowing fix (#2858), a recursive call was treated as a shadowed local tag and mounted through the full component path, which made nested trees about 30% slower to mount.

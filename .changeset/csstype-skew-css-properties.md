---
'octane': patch
---

Keep `CSSProperties` compatible with csstype 3.2.4. When `@types/react` resolves a newer csstype than Octane, the hyphenated style keys React already types (such as `caret`) no longer conflict, and `viewTransitionScope` follows React's type once csstype declares it, so Octane styles stay assignable to `React.CSSProperties`.

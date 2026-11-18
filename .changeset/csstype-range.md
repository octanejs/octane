---
'octane': patch
'@octanejs/styled-components': patch
'@octanejs/window': patch
---

Keep `CSSProperties` from `octane/jsx-runtime` typechecking with csstype 3.2.4, including when the install holds a different csstype for `@types/react` than for Octane. Octane and `@octanejs/styled-components` now depend on `csstype` through a caret range, so a fresh install shares one copy. `@octanejs/window` now types its styles with Octane's `CSSProperties` instead of React's, so Octane's wider `viewTransitionScope` (which accepts `!important`) passes through it.

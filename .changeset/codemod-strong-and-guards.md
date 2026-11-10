---
'@octanejs/codemod': patch
---

With `--strong`, a `value && <element />` guard on a name or property path becomes `@if (value) { <element /> } @else { <>{value}</> }`, which renders a falsy value such as `0` as React does and passes Strong's new `OCTANE_STRONG_VALUE_JSX` check.

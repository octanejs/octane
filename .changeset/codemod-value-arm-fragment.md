---
'@octanejs/codemod': patch
---

A ternary between an element and a value now migrates the value arm as `<>{value}</>`. It was emitted as a bare `{value}` arm, which is a JavaScript block rather than a hole, so that branch rendered nothing and is now a compile error.

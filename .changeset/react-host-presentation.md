---
'octane': patch
'@octanejs/codemod': patch
---

Allow React to set the host class and style on `OctaneCompat` and
`OctaneCompatInline` with `hostClassName` and `hostStyle`. Both hosts use
`display: contents` by default.

Keep the codemod's React SSR ownership checks active when a host sets either
presentation prop.

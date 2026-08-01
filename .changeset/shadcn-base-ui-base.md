---
'@octanejs/shadcn': patch
---

Start the Base UI base, reachable at `@octanejs/shadcn/base-ui/<Family>`.

Seven primitive-free families land: `alert`, `aspect-ratio`, `card`, `empty`, `native-select`,
`skeleton` and `spinner`. Only `alert` is transcribed from upstream's Base UI source and
verified byte-identical to it — the other six are derived from the React Aria base and each
file's header says so, because the bases do genuinely diverge.

Nothing primitive-backed is included. Base UI's primitive API is structurally different from
React Aria's, so those families cannot be derived and need transcribed upstream sources.

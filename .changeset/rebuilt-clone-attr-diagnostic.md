---
'octane': patch
---

When hydration rebuilds an element whose server markup does not match, the
rebuilt element's dynamic attributes, `class`, and `style` now apply the client
values without a second report. Development builds used to log a false value
mismatch for each of them after the one structural mismatch. With
`suppressHydrationWarning` on the rebuilt element, those client values were
dropped entirely, in development and production, because suppression kept the
"server" value, which was only the client template's empty placeholder. A value
mismatch on an adopted server element still reports, and suppression still keeps
the server value there.

---
'octane': patch
---

Require a runtime `octane/signals` import to enable native signal reads in a module. Unrelated `$`-suffixed names no longer change DOM compilation or reject non-DOM renderers; components receiving signal handles or readers through props can import `octane/signals` directly.

---
"octane": patch
---

Smaller text-hole mount codegen: fold the value coercion into `htext`/`htextSwap`.

A text-hole mount previously emitted the coercion inline at every call site —
`htext(el, _v == null || _v === false ? '' : String(_v))`. `htext`/`htextSwap`
now coerce the value themselves (the same coercion `setText` already does), so the
compiler emits a bare `htext(el, _v)` / `htextSwap(pos, _v)`. The coercion runs
exactly where it did (mount-once, never the hot update path), so it's
runtime-neutral and byte-identical output — just less generated code per text hole
(~240 fewer chars on the dbmon component, scaling with text-hole count).

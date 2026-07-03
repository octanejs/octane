---
"octane": patch
---

Prop removal now mirrors the SET path on every prop-diff loop.

The three stale-prop removal loops (spread updates, de-opt reconcile, hostComponent
re-apply) had drifted apart; they now share one `removeHostProp` helper. Fixes folded
in: a removed `htmlFor` clears the real `for` attribute (previously the raw
`removeAttribute('htmlFor')` no-op leaked it); a vanished `className` on a de-opt
element removes the attribute instead of leaving `class=""`; a vanished
`suppressHydrationWarning` resets the element's suppression flag on the de-opt patch
path (it was skipped, leaking suppression onto reused elements); and generic removals
go through `setAttribute(el, name, null)` so aria-* and namespaced attributes remove
with the same semantics they were set with.

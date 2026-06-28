---
"octane": patch
---

Smaller template codegen: stop duplicating property-write bindings across the
mount and update branches.

A `class` / `attr` / `style` / `formAction` / `dangerouslySetInnerHTML` binding
used to emit its write twice — once unconditionally in the mount branch
(`setClassName(_el, _v)`) and once as a guarded diff in the update branch. The
mount now only stores the element ref + seeds the diff field; a single diff runs on
every render and performs the write, firing on the first render via the `undefined`
seed (and `setClassName(el, undefined)` / `setAttribute(el, name, undefined)` no-op
on a freshly-cloned element, so output is byte-identical). Elements carrying a
spread are left untouched — a spread can write any key, so its source-order
position and commit-phase ref timing are preserved. Runtime-neutral; the dbmon
component (6 class bindings) shrinks ~12%, on top of the text-hole and
sibling-navigation reductions (~20% combined).

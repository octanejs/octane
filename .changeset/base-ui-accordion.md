---
'@octanejs/base-ui': patch
---

Add `Accordion` — Root, Item, Header, Trigger and Panel, matching Base UI v1.6.0's anatomy.

Available as `@octanejs/base-ui/accordion` and from the package root. It builds directly on
`Collapsible`: each `Item` runs its own `useCollapsibleRoot` and provides `CollapsibleRootContext`,
so Trigger and Panel reuse the collapsible open/transition machinery unchanged — which is exactly
how upstream composes them. `CollapsibleRootContext` is now exported for that reason.

Ships with `tests/upstream/accordion.test.ts`: 15 cases ported from Base UI's own suite with
assertions unchanged, plus 3 covering single-vs-multiple toggling, which upstream only exercises
in blocks it skips under jsdom.

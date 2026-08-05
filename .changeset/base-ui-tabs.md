---
'@octanejs/base-ui': patch
---

Add the `Tabs` primitive, ported from the pinned upstream at `.base-ui/packages/react/src/tabs/`
(v1.6.0): `Root`, `List`, `Tab` and `Panel`.

It layers over the composite infrastructure this package already carries — `List` is a
`CompositeRoot` (roving focus, Home/End, loop), each `Tab` a `useCompositeItem`, and `Root` wraps
the tree in a `CompositeList` so panels register their own indices.

`Root` owns the controlled/uncontrolled value, the activation direction (computed during render so
children see it on their first render after a change rather than a commit late), an automatic
fallback policy for uncontrolled roots only, and the id registries that wire `aria-controls` on a
tab to its panel and `aria-labelledby` back.

`Tabs.Indicator` is not ported. It positions itself from measured tab geometry and ships a
pre-hydration script with its own SSR contract; adding it later is additive.

`REASONS` gains `initial` and `missing`, which the automatic fallback reports and which no
previously ported component used.

15 cases from upstream's own suite are ported as the parity oracle, each citing its source. Upstream
ships 84 across five files; the remainder are not ported yet, and most of the untouched ones
exercise the Indicator.

---
"octane": patch
---

Faster + smaller template navigation: chain sibling lookups instead of re-walking
from the root.

When a template binds several elements at the same level (e.g. a table row's
`<td>` cells), the compiler resolved each one with a fresh walk from the parent —
`_root.firstChild`, `_root.firstChild.nextSibling`,
`_root.firstChild.nextSibling.nextSibling`, … — which is O(k²) navigation steps for
k siblings, in both generated code and mount-time DOM walking. `ensureVar` now
chains off the nearest already-materialized preceding sibling
(`_el1 = _el0.nextSibling`, `_el2 = _el1.nextSibling`, …), so a row of k cells costs
O(k) steps. Hole-aware templates chain via `sibling(node, n)` (still skipping
control-flow `<!--[-->…<!--]-->` ranges as one logical step), so hydration is
unchanged and output stays byte-identical. On the dbmon fixture's 7-cell row this
trims the compiled component ~5% and speeds the 1,000-row mount ~11%.

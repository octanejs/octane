---
'octane': patch
---

Allow scalar native-parent hydration handoffs to retain independently owned `data-*`, `aria-*`, and `tabIndex` bindings alongside class and style. Keep opaque children and their controls outside the parent lease, preserve native attribute removal semantics, and retain the existing collision, cancellation, and host identity checks. Keep explicitly unbound lowercase native event handlers under normal renderer ownership.

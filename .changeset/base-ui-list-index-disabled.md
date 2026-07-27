---
'@octanejs/base-ui': patch
---

Composite roving focus now skips list items that are not visible, and an explicit `disabledIndices`
no longer suppresses that check. This brings the vendored list-navigation helpers in line with Base
UI 1.6.0's `isListIndexDisabled`, where an explicit `disabledIndices` hit wins, an invisible element
is always disabled, and the `disabled`/`aria-disabled` attribute fallback applies only when no
`disabledIndices` was passed at all.

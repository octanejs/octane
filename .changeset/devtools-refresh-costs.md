---
'octane': patch
'@octanejs/devtools': patch
---

Devtools refresh-path performance: the panel's change detector now compares
per-root tree references (the bridge's per-root cache already makes reference
identity an exact change signal) plus a bounded fingerprint of the selected
node's serialized detail, instead of `JSON.stringify`ing the whole tree on
every throttled refresh — O(roots + detail) per refresh instead of O(app), and
no more multi-MB transient strings on large trees. The component-filter match
walk is memoized against the tree and query. On the bridge, the element-picker
memo now drops its entry on commits/root changes instead of versioning it, so
it never pins a detached DOM subtree after picking stops, and commit-event
assembly is skipped entirely when recording is off and no subscriber is
attached.

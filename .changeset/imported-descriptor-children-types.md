---
'octane': patch
---

The `.tsrx` type view now accepts element children of a `descriptorChildren` component imported from another module, matching the descriptors the bundler passes there. `descriptorChildren` adds a type-only marker that follows the binding through imports and re-exports, so a consumer is rechecked when its exporter gains or loses the marker.

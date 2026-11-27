---
'octane': patch
---

Key the rows of a keyless `@for` under a `descriptorChildren` part by position when a row's element has an empty `key`, such as `<Item key />`, including the elements of a nested `@if` row. Each row had the shared key `true`, so the part saw duplicate keys and the runtime warned. Keyed lists already gave such rows the header key.

---
'octane': minor
---

Every `octane/data` entity now has `one` and `list` output schemas. A read whose `output` is `Book.list` or `Book.one` selects its books without an `entities` function, and a `creates` or `patches` write to `Book` whose `output` is `Book.one` takes its reply as the saved record without `record`. An output of the plain record schema still selects nothing.

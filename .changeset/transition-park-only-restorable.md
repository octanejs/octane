---
'octane': patch
---

Keyed-list parking only defers what a hold can restore.

A value-position keyed list whose slot leaves array mode (the value stops
being an array) discards the slot itself, so rows removed by that flip have
nothing to be restored into. They no longer park for a possible hold — their
teardown runs inline with the attempt that removed them, exactly as it did
before rows learned to wait — instead of being deferred past the rest of the
render as unrestorable.

The rollback that puts a held list back also stops if a teardown cleanup
flips the enclosing boundary to `@catch` mid-restore, instead of writing into
a disposed range.

---
'octane': patch
---

`octane/data`'s encrypted cache saves a value as JSON where JSON keeps it exactly, which writes and restores several times faster than before on a large list, and as before otherwise. Values saved by earlier versions still restore. An earlier version reading a value saved this way discards it, as it would a value from another build, and loads it again.

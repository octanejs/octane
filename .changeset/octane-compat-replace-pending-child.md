---
'octane': patch
---

`OctaneCompat` now replaces a pending island when its component type or child key changes, without waiting for the old load. React's fallback stays mounted until the replacement is ready, and the superseded load can no longer retry, reveal, or report its rejection.

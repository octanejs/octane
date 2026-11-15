---
'octane': minor
---

Let React-hosted Octane islands borrow an explicit signal owner in the browser with `clientSignalOwner`. Both `OctaneCompat` and `OctaneCompatInline` preserve historical hydration reads and then subscribe to the borrowed owner's live signals.

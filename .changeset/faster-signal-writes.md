---
'octane': patch
---

Make signal writes, subscriptions and owner retirement cheaper. A write that reaches many derived values or subscribers does about half the work it did, `scope.get(handle$)` and reads of current values skip state they never needed, and retiring an owner no longer builds an error for nodes nothing reads again.

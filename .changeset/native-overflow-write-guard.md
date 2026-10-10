---
'octane': patch
---

Allow signal writes after a render throws a native stack overflow. An ancestor ending its native-read frame now also ends any descendant frames that the overflow left open, instead of leaving signal writes rejected with `SignalWriteError`.

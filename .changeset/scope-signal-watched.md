---
'octane': minor
---

`scope.signal$` and `scope.derived$` accept a `watched` option: it runs when the signal gains its first observer, directly or through derived values, and its returned cleanup runs when the last observer leaves or the scope is disposed.

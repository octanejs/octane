---
'octane': patch
---

Fix missing root `onCaughtError` reports for first-mount and parent-driven error
boundary catches in non-suspending renders. Publish inline reports after the
fallback's refs and layout effects commit, preserve the original error, and
discard abandoned reports without duplicating existing scheduled-error reports.

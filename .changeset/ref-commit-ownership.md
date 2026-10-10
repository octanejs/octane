---
"octane": patch
---

Omit unused ref commit and subtree collection helpers from production bundles. Install the existing helpers when a ref queue first needs them, preserving ref timing, visibility and cleanup.

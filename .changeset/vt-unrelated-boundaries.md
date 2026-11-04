---
'octane': patch
---

Start no document View Transition for a commit that reaches no `<ViewTransition>` boundary, matching React 19.3. Suspense reveals and transitions no longer start one when no boundary exists, when the only boundaries are in another root, or when they sit in an unrelated subtree. Chromium sends input to `<html>` while a document transition runs, so these empty transitions could drop a click.

---
'octane': patch
'@octanejs/tanstack-router': patch
---

Support Router-owned executable templates through an internal compiler capability, preserving ordinary template inertness and adopting server scripts without replaying them during hydration.

Keep permanent static hydration ranges independent of the deferred activation implementation in client bundles.

Render Router-managed scripts with Strong keyed templates while preserving inline/external execution on navigation, managed keys, CSP nonces and self-removing Start transport. Preserve server-only scroll-restoration content in a static hydration range and remove it after hydration.

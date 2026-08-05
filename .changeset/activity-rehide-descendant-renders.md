---
'octane': patch
---

Keep hidden Activity DOM hidden when a descendant independently replaces its output.

State updates, error and Suspense retries, and accepted hot-module updates now reapply the nearest
hidden Activity's visibility after rendering. Replacement elements and text remain hidden until the
Activity reveals, while authored display and text values are restored correctly on reveal.

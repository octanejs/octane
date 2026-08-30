---
'octane': patch
---

Make hydration render-phase queue draining scale linearly.

Hydration now partitions the live scheduler queue in one pass instead of
repeatedly rescanning and splicing it for every target-root update. A production
multi-root benchmark at 1,024 rows dropped from 20.6 ms to 7.0 ms while
preserving synchronous convergence, server-node adoption, foreign-root work,
delegated interaction, render-loop limits, and error cleanup.

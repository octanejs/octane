---
'octane': patch
---

Stamp each block's context-dependency maps with the context epoch they were recorded or verified at, so memo and implicit bailouts skip per-entry version scans whenever no provider has committed a change; stale restamps and pending propagations still force the scans, preserving refresh behavior.

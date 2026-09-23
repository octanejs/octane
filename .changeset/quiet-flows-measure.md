---
'@octanejs/xyflow': patch
---

Isolate the inner hook slots used by flow measurement, node and edge update queues, viewport helpers, and interactions. Preserve optional hook arguments so compiled consumers can measure visible nodes, call `fitView`, and use independent keyboard and connection subscriptions.

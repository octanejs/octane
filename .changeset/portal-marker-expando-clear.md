---
'octane': patch
---

Closing a portal no longer allocates a property dictionary for each of its two comment markers. Teardown used `delete` to remove the markers' event-range fields, and that switches a DOM wrapper into dictionary mode. It now clears the fields instead. Event routing is unchanged.

On the `portal-swarm` benchmark, opening and closing all 600 tooltips allocates 4.6% less (3,101 KB to 2,958 KB), and `open_close_cycle` runs 1.5–3% faster (paired, A/A-controlled).

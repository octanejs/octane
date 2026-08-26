---
'octane': patch
---

Keep development TSRX HTML-nesting diagnostics linear by deduplicating them with
one identity set per compiled render plan instead of rescanning and serializing
every diagnostic already collected for each new authored site.

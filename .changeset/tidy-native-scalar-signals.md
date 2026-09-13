---
'octane': patch
---

Let compiler-proven scalar signal derivations omit general async computation
machinery. Avoid repeated owner resolution on cached signal reads while preserving
request isolation, historical reads, and retirement checks.

---
'octane': patch
---

Collect applied theme dependencies before a stylesheet first enters a server response, including when a component and its extending theme share a module. This preserves base-before-override CSS order and includes base-defined CSS variables for captured class-map entries.

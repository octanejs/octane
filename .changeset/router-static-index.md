---
'@octanejs/app-core': patch
---

Index static routes by exact path so request matching is O(1) instead of a linear scan, while still falling through to parameter and catch-all routes after a method miss.

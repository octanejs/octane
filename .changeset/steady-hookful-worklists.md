---
'octane': patch
---

Speed up compilation of large stable-hookful component graphs by propagating candidate invalidations, live captures, and private setter publications through dependency worklists instead of repeatedly rescanning every component.

---
'octane': patch
---

Keep named derived and query producers reader-owned when they capture local
signals. The same function, when forwarded as a callback, continues to read the
declaring component's cell. This also preserves owner identity through SSR and
hydration.

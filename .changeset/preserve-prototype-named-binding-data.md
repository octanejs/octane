---
'octane': patch
---

Preserve `__proto__` shorthand data properties when specializing DOM binding
child programs with fixed primitive props. Adoption and mounting now retain the
authored text and attributes without introducing object-literal prototype setters.

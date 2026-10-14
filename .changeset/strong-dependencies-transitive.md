---
'@octanejs/cli': patch
---

`octane analyze --strong-dependencies` now follows the imports of every Strong module it reaches in a dependency, not only those of the project's own Strong modules. A non-Strong module, or an `octane/react` boundary, behind a Strong dependency module is reported. Previously the report stopped at the first Strong layer, so an empty report did not prove that everything the project renders is Strong.

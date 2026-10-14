---
'@octanejs/cli': patch
---

Add `octane analyze --strong-dependencies`. It lists, by package, the Octane modules that Strong modules import from other packages, directly or through re-exports, which compile without Strong mode. It also lists the `octane/react` (ReactCompat) boundaries those imports reach. The report never fails the run.

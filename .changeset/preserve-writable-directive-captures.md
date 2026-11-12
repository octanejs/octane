---
"octane": patch
---

Keep directive arms that reassign captured locals in their original lexical scope, so early-return branches share updates with their closures.

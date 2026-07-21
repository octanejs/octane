---
'octane': patch
---

Fix source maps drifting when the compiler-owned memo prelude is emitted.

The transactional auto-memo cache and the inline hook-memo cell array each
insert two lines above a component's setup statements, but the per-statement
source mappings were recorded against the prelude-free layout — every setup
statement's mapping pointed a fixed number of lines away from its real
position (production client compiles only; dev/profile decline the memo
region, which is why their maps were unaffected). Mappings now account for
the emitted prelude height, so positions in production client output trace
back to the correct source statements.

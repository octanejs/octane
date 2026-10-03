---
'octane': patch
---

Render-heavy updates are faster. Every component render restored the warm-plan
stack on exit by storing its length, even though most renders register no plan
and leave the length unchanged. The restore now compares first. In paired
same-runner runs, a memo-wall single-row change through a value-position list
took about 13% less time, a context update through 1,000 memoized rows about 5%
less, and recursive-context updates 4–5% less.

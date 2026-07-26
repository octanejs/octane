---
'octane': patch
---

The auto-memo analysis no longer walks each component body twice to collect the
imported components it renders and to look for a deferred ref read. Both
questions are answered by one traversal, halving the node visits and visited-set
allocations those two passes cost. Compiler output is unchanged.

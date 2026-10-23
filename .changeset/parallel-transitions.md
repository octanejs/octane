---
'octane': minor
---

Commit unrelated transitions independently, as React 19.3's parallel transitions
do. A suspended transition no longer holds back another one: each commits when
its own data is ready, whether its Suspense boundary is separate or shared, and
its `isPending` falls when it commits. Transitions that update the same state, and the boundaries one transition
suspends, still commit together.

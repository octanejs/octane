---
'octane': patch
---

Add the shared runtime inspection ABIs: a real commit-boundary channel (`__profileOnCommit` / `__profileCommitFinish`, signaled synchronously from the actual flush end, with touched-root attribution in devtools builds and the devtools bridge consuming the same channel), pull-based `profiler.domNodes(instanceId)` served by one runtime subject→elements resolver shared with the devtools adapter (lite scopes over-approximate to their host bounded by the insertion anchor), `__profileComponentId` for overlay consumers, and per-root memoization of the devtools tree so `getTree()` re-walks only roots with work scheduled since their last commit.

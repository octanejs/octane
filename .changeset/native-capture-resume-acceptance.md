---
'octane': patch
---

Thread deferred native acceptance through suspense resume and hidden-reveal publication.

`commitResumeInner` and `attemptHiddenRevealInner` discarded the result of `acceptNativeCapture`, so a capture whose acceptance the deferred-layout driver had staged still reached `spliceOffscreenCapture` with `deferredNativeAcceptance === false`. That splices an unaccepted capture and throws "A native capture must be accepted before publication." out of a suspense-retry or reveal commit, abandoning every effect, ref attach, and store sync queued on that commit. Both sites now pass the flag the way `flushRootTransactions` already did.

---
'octane': patch
---

Keep previously committed DOM usable while an updated component tree suspends.
Compiled bindings, generic hosts, keyed lists, portals and signal subscriptions
now publish together when their owning render is accepted. Discarded renders
leave existing DOM and user edits intact. Hydration uses one cursor across roots,
deferred islands and retries and no longer snapshots or replays DOM mutations.
Preserve ViewTransition and controlled-input behavior at the accepted commit.

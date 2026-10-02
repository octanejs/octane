---
'octane': patch
---

Deferred hydration no longer lets a live interaction overtake one captured
before hydration. A `<Hydrate>` boundary or independent island replays its
captured events after its hydration commits, which can be a frame later. An
event that arrived in between reached the hydrated handlers immediately, so
clicking option A before hydration and option B during it ran B's handler first
and left A selected. The boundary now keeps capturing until its replay runs, so
handlers see input in the order the user produced it. An island whose content
is still suspended after activation also keeps those events instead of
dropping them on the inert server markup.

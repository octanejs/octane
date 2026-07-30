---
'octane': patch
---

Defer a held synchronous transition's whole commit.

A transition that suspends now holds the entire screen — including everything
it patched outside the suspended boundary. Shell text, attributes, controlled
form state and keyed structure revert with the hold, `isPending` stays on, and
the new screen lands in one step when the data arrives, matching what async
Actions already did. The composition benchmark records zero exposed
intermediate states for a transition update, level with React.

A value hole that leaves array mode during a held transition now re-asserts
the held rows instead of showing the flipped-in content early, and a
sole-child hole that flips array to text and back no longer crashes on the
wiped list markers.

One residual is pinned at its own benchmark ceiling: the promoted round after
a dependent request resolves re-creates warm-started fetches (served by the
application cache, so nothing refetches over the network) until the follow-up
resume work restores the exact creation floor.

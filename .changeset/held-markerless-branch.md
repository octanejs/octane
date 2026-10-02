---
'octane': patch
---

Keep the server nodes that a `@switch` or `@if` arm adopted when the arm
suspends inside a deferred `<Hydrate>` boundary before it has a range of its
own.

When the server rendered no range for a `@switch` or `@if`, the client's arm
takes the place of the server node at that position and adopts it. If that arm
suspended inside a `<Hydrate split={false}>` boundary, the boundary's retry
published the arm's range after the sibling that followed it, so that sibling
reported a false mismatch and built a second copy of its server node. A case
change while the boundary was still pending removed the wrong server nodes, with
the same result for the next sibling. The arm now marks where its content starts
with a comment of its own and keeps track of how far that content reached. Its
retry finalizes the range from there, and another case replaces exactly that
content and renders on the client without reporting a mismatch. This works for
arms whose content is text, several roots, or a root the arm had not yet cloned.

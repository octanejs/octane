---
'octane': patch
---

Keep the server node on screen until a root that hydration rebuilt over it
commits.

When a template root did not match the server node at its position, hydration
removed that node as soon as it built the replacement. If the replacement then
suspended (a `use()` after the mismatched root), the server content vanished
while it waited. A deferred `<Hydrate split={false}>` boundary also retried the
suspended arm from the next server sibling, so the retry mismatched that sibling
too, reported a second mismatch and rebuilt it. The server node now stays until
its replacement commits in its place. A retry rebuilds over the same node
without reporting it again. A `@switch` or `@if` arm that suspended this way
still owns the node, so a case change replaces it.

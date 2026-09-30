---
'octane': patch
---

A keyed `@for` row no longer leaves a partial copy of itself behind when a child
suspends or throws during the row's first render. When the row's only root is an
element, a component whose only root is an element, or an `@if` whose branches
are single elements, the row's element was already in the list when the child
suspended. Nothing owned it, so the retry rendered the row again beside the
stale one, or ahead of the rows that came before it. The partial element is now
removed with the rest of the row, whether the row is mounted, inserted by an
update, or rendered by a client that has more rows than the server. During
hydration, the retry no longer adopts the partial element as server output.

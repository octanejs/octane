---
'octane': patch
---

Stop the de-opt reconciler removing DOM it did not create.

An element rendered with no children still had its existing DOM reconciled
against an empty child list, so anything inserted by other means — a
`replaceChildren` with a captured snapshot, a third-party widget mounted into a
container — was swept away by the next unrelated re-render. React only manages
children it created, and portal ranges were already excluded here for that
reason; this extends the same treatment to imperative content.

Children the renderer did commit still clear when they go away, so
`{cond && <X/>}` is unaffected.

Found from `@octanejs/base-ui`, whose popup Viewport fills a snapshot container
this way and lost its previous content mid-transition.

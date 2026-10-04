---
'octane': patch
---

Cancel a component's superseded `query$` request when only a pending `@try` arm reads it.

A `query$` declared in a component and read with `.get()` inside that component's
`@try`/`@pending` boundary kept its previous request live after the component
committed a new selection. The arm's suspended attempt discarded the new
declaration, so the old request's `AbortSignal` stayed un-aborted until the
component unmounted. The component's commit now selects the new request and
aborts or closes the obsolete one, for promise and stream queries alike. An
asynchronous `derived$` read the same way now adopts the committed computation
for its next dependency-driven restart instead of keeping the previous render's
closure.

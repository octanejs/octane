# Octane signal continuity

The language of signal values that remain consistent across server rendering,
early browser interaction, hydration, and subsequent streamed navigation.

## Language

**Signal declaration**:
A reusable definition of a value or computation, independent of the request or
browser document in which it is used.
_Avoid_: Global value, singleton state

**Owned signal**:
A signal declaration's live state within one request, browser document,
render-instance, or explicitly chosen lifetime.
_Avoid_: Signal declaration when referring to a particular live value

**Live value**:
The current value of an owned signal, including accepted user edits and streamed
results.
_Avoid_: Hydration snapshot, initial value

**Historical value**:
The value represented by a particular server-rendered view, which can differ
from the live value by the time that view hydrates.
_Avoid_: Live value, latest server value

**Early edit receipt**:
Evidence of a user edit made before the live signal behavior starts, including
an edit that returns a control to its previous value.
_Avoid_: Value difference, pending draft

**Selection generation**:
One occurrence of selecting content, distinct from selecting that same content
again after navigating away.
_Avoid_: Conversation identifier alone

**Stream attempt**:
One production of server results, which can feed several independently owned
result channels. A replacement attempt need not change the user's selection.
_Avoid_: Selection generation, cached result

**Result channel**:
The ordered results delivered to one selected consumer of a stream attempt;
retiring one channel need not retire other consumers of that attempt.
_Avoid_: Stream attempt, HTML placement

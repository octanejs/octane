---
'octane': patch
---

Fix a crash when a sole-child value hole leaves and re-enters array mode.

An element whose only child is a `{expr}` hole renders markerless (the slot
owns the whole element), and an array value lazily mints a comment marker pair
inside the element to anchor the keyed list. Clearing the slot on a later kind
flip swept those markers out of the DOM but kept the slot's references to
them, so the next mount anchored on detached comments: flipping
array → text/null/host → array crashed with
`Cannot read properties of null (reading 'nodeType')`, and array → component
threw `NotFoundError` while inserting the new content. The owns-parent clear
now forgets the swept marker pair, so re-entering array mode re-mints a live
pair and every other regime returns to the markerless baseline.

---
'octane': patch
---

A `<textarea>` whose children come from a spread or a `children=` prop, such as
`<textarea {...{ children: value }} />`, no longer empties on updates after
mount, whether it was mounted on the client or hydrated. Its default value now
follows every render, as it already did for authored JSX children. A signal
update to another prop in the same spread no longer clears it either.

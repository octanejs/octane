---
'octane': patch
---

Let `'use dom bindings'` views bind `start` on an ordered list, `value` on a list
item, and `rowspan` on a table cell. The compiler used to reject all three: the
binding runtime did not apply React's rule that removes a `start` or `rowspan`
that is not a number, and it treated every `value` except a button's as form
state. These attributes now update in place and match what the server renders,
in both adopted and constructed views. Form `value`, `checked` and form identity
attributes still have to be static or `unbound`.

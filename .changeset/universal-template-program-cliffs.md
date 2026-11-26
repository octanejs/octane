---
'octane': patch
---

Keep more universal hosts in prepared template programs and patch pure rows in place.

A template program may now carry events on its root node: rows whose click
handler sits on the row element mount as one program run instead of one full
template per row. A driver that declares `templateProgramStructuredValues`
also receives plain-data values (style objects, modifier lists) in programs;
they compare by content like ordinary host props. A compiler-proven pure
`@for` row whose output stays the same program is adopted in place when its
inputs change: the commit writes only the changed bindings and swaps event
handlers under their committed listener IDs, without re-materializing or
reconciling the row.

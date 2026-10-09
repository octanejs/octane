---
'octane': patch
---

Keep keyed `@for` rows in order when a row-local binding shadows an imported component.

A keyed `@for` row whose only child is an imported one-element component uses
that element as its own boundary. The compiler read the import's single-root
mark even when a row declared its own component under the same name, such as
`const Row = row.id % 2 ? Pair : RowImpl`. Rows that rendered two elements then
lost their boundary, so reordering or removing rows left stale nodes behind.
The mark is now read only when the tag resolves to the import itself.

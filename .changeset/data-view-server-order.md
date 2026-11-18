---
'octane': minor
---

`octane/data` views now refuse a window the server did not sort in the view's order: the handler and the store fail the read with `invalid` and an issue naming the view, instead of showing rows out of place or losing them at a page's edge. A view's last tiebreak now compares the entity key's own value, so integer keys sort as a database sorts them. Cursor `pages` of a read show a pending created record once instead of on every page.

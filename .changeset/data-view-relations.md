---
'octane': minor
---

Add `with` to `view` in `octane/data`, which joins each row to the records it points at: `with: { author: [User, 'authorId'] }` gives every row an `author`. The handler returns each row with its related records under those names, and the store keeps them as shared records of their own entities. An edit to a related record shows in every row that points at it, a row keeps its identity until its record or one of its related records changes, and a change to a related record reaches only the views showing a row that points at it. `where` and `order` see the view's own record only.

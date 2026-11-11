---
'octane': minor
---

`octane/data` adds declared lists. `view({ name, of, where, order })` defines a list by a rule over an entity instead of by a server response. A view loads the window it shows plus a margin of 20 rows either side, shares those records with every other view of the entity, and evaluates its rule locally. An edit then moves a record into, out of, or across every view in the task that made it, and a later page shifts when a record moves above it. A write can name its saved record with `record`, and a view takes that record from the reply instead of reloading. Removals settle the same way. A view's handler serves `limit` records from position `offset` of the view's order, and must sort exactly as the view does. `max` caps what one request may ask for.

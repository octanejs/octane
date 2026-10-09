---
'octane': patch
---

Keep signals writable after an empty list fills with 16 or more rows.

With native signal reads enabled, a production build mounts host-only rows into
an existing empty `@for` list without the ordinary row renderer once there are
at least 16 rows. Each row that read signals natively left its read frame open,
so the signal write guard stayed active after the render returned and the next
unrelated write threw `SignalWriteError` (#152). Each row now opens and closes
that frame as the ordinary renderer does, including when a row throws or
suspends, and rows holding a signal handle keep updating.

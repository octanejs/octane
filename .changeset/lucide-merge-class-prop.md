---
'@octanejs/lucide': patch
---

Merge an Octane `class` prop into the icon's classes.

`Icon` merged `className` with its own `lucide lucide-<name>` classes but passed
`class` through untouched. On the client the `class` value then replaced the
icon's classes, and on a server render the svg carried two `class` attributes,
of which the browser keeps the first, so `<Camera class="size-5" />` lost
`size-5` on server-rendered pages. `class` now composes clsx-style (strings,
arrays, objects) and merges after `className`, on the client, on the server and
through hydration.

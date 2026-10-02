---
'octane': patch
---

Remove the server content left after a component's content during hydration. When the server rendered more in a component's range than the client renders there, the client adopted the matching prefix and kept the rest on screen without a report. This happened for a component whose identity differs on the client, for a hookless component in a renderable hole, and for a component that returns less on the client, including one rendered as a list item. Hydration now discards the stale remainder and reports it once through `onRecoverableError`, plus a located development warning. The nodes the client adopted keep their identity. To find where a multi-root template's roots end without parsing it in production, the compiler now passes the template's root count to `template()`.

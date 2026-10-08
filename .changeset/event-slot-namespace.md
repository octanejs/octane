---
'octane': patch
---

Stop running click handlers twice when a Solid-built widget is mounted inside an Octane root.

Octane stored delegated handlers on DOM nodes at `$$<type>` (`$$click`), the same property Solid's event delegation uses. Inside an Octane root, each library's dispatcher found and called the other's handlers. A click on a TanStack Query devtools row ran its toggle twice, so the details view never opened, and once Solid's `document` listener was registered, every Octane `onClick` on the page ran twice as well. Delegated handlers now live at `$o<type>` and `$ocapture:<type>`, which no other delegation reads. Compiled output keeps the same size, because each key is as long as before. Code that wrote `el.$$click` by hand was relying on an undocumented internal and must write `el.$oclick` instead (#1882).

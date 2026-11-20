---
'octane': patch
---

Fix `<Activity mode={…}>` returned from a component: children that read the component's locals no longer throw `props is not defined`.

---
'@octanejs/dexie': patch
---

`dexie` is now a peer dependency (`^4.4.4`), as it is for `dexie-react-hooks`. Before, the binding installed its own pinned Dexie 4.4.4, so an app on another Dexie release, such as 4.4.7, loaded two versions and Dexie threw `Two different versions of Dexie loaded in the same app` at import. Install `dexie` next to `@octanejs/dexie` if your app does not already have it.

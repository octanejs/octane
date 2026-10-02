---
'octane': patch
---

Fix a `<Hydrate>` activation that suspends on a child inside a hydrated component fragment. When the server rendered another component's content in that component's range and the client fragment started with a component, hydration adopted the fragment over the wrong nodes. The child then discarded its own insertion point and threw `NotFoundError`, and the fragment's static roots were never created. Such a fragment is now rebuilt and reported once. Below a passthrough root, whose ranges can sit one level off, hydration keeps its previous behavior. When the suspended child resumes, it completes as client DOM if it mounted inside the rebuilt fragment, instead of reporting a second mismatch. A component that comes after it now adopts its own server range, so its server nodes are kept. This also fixes a resume that removed and duplicated server nodes when the server rendered the same content.

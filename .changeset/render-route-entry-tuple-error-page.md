---
'@octanejs/vite-plugin': patch
---

Fix the dev SSR error page printing the raw route `entry` tuple. A route
configured with the `[exportName, modulePath]` tuple form rendered as the
comma-joined array (`Post,/src/Post.tsrx`) on the 500 error overlay; it now
resolves the module path through `get_route_entry_path`, "matching how the
renderer resolves the entry path everywhere else.

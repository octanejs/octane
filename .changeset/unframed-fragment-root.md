---
'octane': patch
---

Adopt a component whose template has several roots when hydration finds the server's nodes without a range of its own, as when the server rendered a different `@if` arm with the same markup inline. In development builds the component adopted its first root, but the next component then read that root as its own and reported a mismatch. In production builds the component was rebuilt and reported as a mismatch. Both builds now adopt the server nodes when every root matches, report nothing, and continue after the last root, so the next component adopts its own server range.

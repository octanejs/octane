---
'@octanejs/tanstack-router': patch
---

Remove the server's scroll restoration script when a route hydrates. With `createRouter({ scrollRestoration: true })`, the server renders router-core's inline restore script but the browser build of router-core has no script, so the client hydrated an empty arm over it and the server `<script>` stayed in the document. The client now takes the arm the server took, and `ScriptOnce` adopts the server script during hydration without comparing its content, then removes it. `ScriptOnce` also renders nothing on a client-only mount, as `@tanstack/react-router`'s does.

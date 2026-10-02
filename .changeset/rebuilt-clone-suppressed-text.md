---
'octane': patch
---

When hydration rebuilds an element whose server markup does not match, a text
hole inside the rebuilt element now shows the client's text even when its
element carries `suppressHydrationWarning`. Suppression keeps the server's text,
but a rebuilt element holds the client template's placeholder rather than
server output, so the client text was dropped and the element rendered blank in
both development and production builds. Suppression still keeps a differing
server text on an element that hydration adopts from the server.

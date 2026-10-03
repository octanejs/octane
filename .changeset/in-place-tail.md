---
'octane': patch
---

Remove the server markup left after a component's last call when that call adopted its server node in place. When the server rendered another component's markup in a component's range, and the client's content there is a sequence of calls without server ranges of their own, each call adopts its server node in place. Whatever the server rendered after the last call's nodes stayed on screen, and hydration reported nothing. Hydration now removes it and reports the mismatch once through `onRecoverableError`, while the nodes the calls adopted keep their identity. This covers single roots and fragments, in lite and full component slots, in development and production builds.

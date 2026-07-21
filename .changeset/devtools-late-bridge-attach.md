---
'@octanejs/devtools': patch
---

The devtools panel no longer parks in a dead state when the runtime bridge
attaches after the initial 5s wait (a slow cold load can install it late).
After logging its one hint, the panel keeps listening at a relaxed 1s cadence
and mounts whenever the bridge appears; unmounting stops the wait and removes
the host as before, so nothing leaks on pages where the bridge never arrives.

---
'@octanejs/three': patch
---

Stop keeping a history of every committed scene update on a root. Each root created by `createRoot`, `Canvas`, or the `@octanejs/three/testing` harness used to append every accepted host batch to its container's `commits` array and never drop it. A long-lived scene therefore held on to every replaced props object, listener value, and destroyed-object record for as long as it stayed mounted. These roots now keep `commits` empty. A container created directly with `createThreeContainer` still records its batches unless its environment sets `recordCommits: false`.

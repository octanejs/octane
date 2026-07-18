---
'@octanejs/three': patch
---

Mark package modules as side-effect-free so bundlers can remove unused
public-root subsystems such as portals, DOM regions, and scheduling from
Canvas-only applications.

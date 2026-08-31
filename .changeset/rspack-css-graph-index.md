---
'@octanejs/rspack-plugin': patch
---

Resolve multiple CSS-module constant-folding proofs by scanning the current Rspack module graph once per compilation phase instead of once per CSS request.

---
'octane': patch
---

Keep hookless same-module components on the lightweight component path inside production memo regions when their subtree cannot read context, instead of giving each one a full Block. Mounts and changed-prop updates of such component chains do less work; rendering, hydration and update behavior are unchanged.

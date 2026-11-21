---
'octane': patch
---

Release a closed subtree that rendered JSX children created by a component that stays mounted. A JSX element with expression children, such as `<Item>{label}</Item>`, kept a reference to the render scope that first read its children even when those children read no context. When that scope belonged to a subtree that later closed, such as the items of a popup or menu, the closed scope and its detached DOM stayed reachable for as long as the parent kept the element. In modules that import `octane/signals`, the subtree that read the children last stayed reachable instead. Now a scope is kept only for children that read context, which compare scopes to decide when to rebuild.

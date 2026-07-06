---
"octane": patch
---

Add `isChildrenBlock(value)` to distinguish compiled element/text children from render-prop function children.

A component's element/text children (`<C><D/></C>`) lower to a render function, while a render-prop child (`<C>{(data) => …}</C>`) is passed through raw — both are `typeof === 'function'`, so React-ecosystem APIs that branch on `typeof children === 'function'` (function-as-child / render props) could not tell them apart. The compiler now tags compiled children-blocks (`markChildrenBlock`), and the new public `isChildrenBlock(value)` returns `true` only for them, so a consumer can write `typeof children === 'function' && !isChildrenBlock(children)` to detect a genuine render-prop child. Enables faithful ports of libraries whose components accept either content or a render function (e.g. Base UI's Dialog/Popover payload render functions).

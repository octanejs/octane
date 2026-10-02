---
'octane': patch
---

Cache Strong-mode inline render expressions the way the same expression is cached when a `const` names it. In a production client build, an eligible expression in a host child hole, a host attribute, or a component prop, such as `<output>{total.toFixed(2)}</output>` or `<List rows={visible(rows)} />`, now recomputes only when its component-local inputs change, matching React Compiler. Expressions in `@if`, `@for`, `@switch`, and `@try` arms, component children, and built-in boundaries still evaluate only when they render. Expressions that contain JSX, event handlers, refs, and keys keep their existing lowering. A component that returns JSX gets the cache only after an authored hook call, so a hookless one stays an ordinary function. Parallel `use()` warm plans still start a child's request from the authored prop expression. Compatibility mode, development builds, and the server are unchanged.

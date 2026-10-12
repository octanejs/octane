---
"octane": patch
---

Refresh context consumers inside list rows that production builds skip. When a row's item was unchanged, a `@for` or compiled `.map()` list left the row untouched, so a component the row rendered from a value hole such as `{item.content}` kept a stale context value after its Provider changed. This happened whenever no whole-list cache covered the list, for example with a filtered iterable or after a keyed selection change. Skipped rows now refresh their consumers after a Provider value change and, below a `memo` component that updated its own state, keep their consumers' context reads on it, the way a `memo` bailout does.

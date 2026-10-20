---
'octane': patch
---

Binding views can forward a closed parameter rest to a child view, adopt a native root inside a child's `@if` arm, and hand off composed native buttons to `hydrateRoot`. That includes closed-rest `disabled`, `hidden`, `type`, `command`, `commandfor`, `popovertarget` and `popovertargetaction` channels, unbound provider spreads inside structural views, and hosts behind pure `const` aliases. Renderer updates to a presentation view's host spread now write at commit.

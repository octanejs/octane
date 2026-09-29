---
'octane': patch
---

Fix a `ReferenceError` in DOM-compiled nested templates. Inside a setup-bearing
`@{ … }` child, a `() => @{ … }` sub-template (including a `createPortal` body),
or a `function F() @{ … }` declared in a component, an `@if`, `@for`,
`@switch` or `@try` arm, or a lifted event handler, could read the template's
own locals or parameters, or the enclosing component's locals, as unbound
identifiers on mount, hydration, update, or when the event fired. The compiler
now passes those names to the code it hoists. A child local that shadows a
stable parent binding, such as a state setter, is also no longer treated as
stable, so a changing handler takes effect.

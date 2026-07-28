---
'octane': patch
---

A directive at value position now compiles inside a callback and at module scope,
so `@if`/`@for`/`@switch`/`@try` no longer depend on sitting directly in a
component body.

**Inside a callback.** A directive's arms are hoisted, so they cannot reach a
callback's parameters lexically — but they never needed to. Captured values
already travel through the construct's env channel, and that channel is built at
the `createElement(_frag$N, …)` call site, which sits inside the callback where
its parameters are in scope. What was missing was the capture set: it held only
the component's own locals, so a name introduced by an enclosing callback was
dropped from the tuple and the arm was emitted reading it free — a module-scope
helper closing over a variable that does not exist there, which only fails once
the arm renders. The set now grows with each callback the value lowering
descends through, and the same names ride an env array on the server, whose subs
are declared in the owning body rather than hoisted. Nested callbacks compose:
an arm may read from every enclosing scope.

**At module scope.** `const v = @if (…) { … };` has no component body to own it
and needs none — it can only close over module bindings, which every hoisted
helper already sees, so its arms hoist beside it with no env at all. Both
emitters fold it to their own shape; previously neither did, and the client's DOM
helpers could be emitted into a server module.

What remains unsupported is a directive inside a MODULE-level callback: the env
channel is built per component, and there is no component to build it against.
That is now the only case the diagnostic covers, and its wording says so rather
than claiming directives need an owning component in general.

Covered by client render, server render, hydration adoption, and type-only
output, including a directive whose arm reads the parameter of an enclosing
callback and one that reads through two nested callbacks.

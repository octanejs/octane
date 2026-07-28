---
'octane': patch
---

Directives used at a VALUE position now compile on the client and the server.
A `@if`/`@for`/`@switch`/`@try` is compiler-owned template syntax, but a value
position lowers through the descriptor path rather than the template walk, and
that path had no case for it. What happened next depended only on where the
directive sat:

- `const branch = @if (ok) { … } @else { … }` emitted
  `const branch = {createElement(…)}` — an object literal wrapping a call
  expression, so the module did not parse. Setup attribute values
  (`<Child prop={@if …} />`) had the same shape. The lowered descriptor was
  always wrapped in a `JSXExpressionContainer`, which is right only in JSX child
  position; anywhere else it prints as a bare `{expr}` block.
- `<Child prop={@for …} />` and `<div>{@switch …}</div>` in rendered output
  reached the printer as raw TSRX nodes and threw
  `Not implemented: JSXIfExpression`.
- `<Child prop={<h1>@if … </h1>} />` and `<div>{<h1>@if … </h1>}</div>` — a host
  element that is itself a value, holding a directive among its children — were
  compiled with the directive **silently dropped**. The element lowered to a
  `createElement` descriptor whose child lowering discarded every node it did not
  recognise, so the arms vanished with no diagnostic.

All of these now fold through the same hoisted-renderer path setup directive
values already used, so each arm compiles once and the value becomes an ordinary
renderable descriptor. Both emitters publish that fold for the body being
compiled and restore the previous owner afterwards, so a nested body never folds
its arms into its parent's helper list.

The fold stops at a callback boundary. A directive's arms are hoisted into the
body that owns them and read the values that body threads in, so folding one that
belongs to a callback would hoist arms referencing the callback's params into a
scope where those params do not exist — a module-level helper closing over a free
variable, which only fails once the arm renders. A value-position directive with
no owning body is now a compile error naming the authored keyword and pointing at
the fix (move the markup into its own component), rather than silently dropped
markup or a helper that throws at runtime.

The type-only (`to_ts`) emitter was already correct here; this brings the client
and server emitters in line with it. Covers all four directives across the
initializer, attribute-value, expression-container and element-holding-a-directive
positions, in rendered output and in setup, with client render, SSR and hydration
adoption tests.

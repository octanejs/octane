# @octanejs/cmdk

[cmdk](https://github.com/dip/cmdk) — the fast, composable command menu — ported
to the [Octane](https://github.com/octanejs/octane) renderer.

This is an Octane port of `cmdk@1.1.1`. It preserves cmdk's public API (the
`Command` namespace, `useCommandState`, `defaultFilter`) and its
DOM-authoritative filter/selection model, adapting only the React-renderer
wiring to Octane (native events, ref-as-prop, `useId`), and building on
[`@octanejs/radix`](../radix) for the Radix primitives cmdk depends on.

> **Alpha.** The whole component set is implemented — `Command`, `Command.Input`,
> `Command.List`, `Command.Item`, `Command.Group`, `Command.Separator`,
> `Command.Dialog`, `Command.Empty`, `Command.Loading`, plus `useCommandState`
> and `defaultFilter` — with filtering, score sorting, keyboard navigation,
> controlled modes, and SSR + hydration. `asChild` is the one unsupported prop.
> There is no differential suite against the real cmdk + React yet. See
> [`docs/cmdk-port-plan.md`](../../docs/cmdk-port-plan.md) and the authoritative
> [`docs/bindings-status.md`](../../docs/bindings-status.md).

## Divergences from React cmdk

Standard Octane binding adaptations (see
[`docs/react-parity-migration-plan.md`](../../docs/react-parity-migration-plan.md)):

- `Command.Input` drives search from the native `onInput` event; the public
  `onValueChange(search)` API is unchanged.
- Components take `ref` as a normal prop (Octane has no `forwardRef`).
- Callbacks (`onSelect`, pointer, keyboard) observe native DOM events.
- Item/group values come from the `value` prop or the rendered `textContent`;
  cmdk's string-child inspection is dropped (Octane's compiled children are
  opaque).
- `asChild` is **not** supported: cmdk clones the child element and re-parents
  the component's own content into it, which has no faithful equivalent over
  opaque compiled children.
- Group reordering resolves the group element by its registered value; upstream
  looks it up by `[data-value="<groupId>"]`, which can never match.
- Radix `Primitive`/`Slot`/`Dialog`/`useId` come from `@octanejs/radix` and
  `octane`.

## License

MIT. The vendored `command-score` implementation retains its upstream MIT
license.

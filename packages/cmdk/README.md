# @octanejs/cmdk

[cmdk](https://github.com/dip/cmdk) — the fast, composable command menu — ported
to the [Octane](https://github.com/octanejs/octane) renderer.

This is an Octane port of `cmdk@1.1.1`. It preserves cmdk's public API (the
`Command` namespace, `useCommandState`, `defaultFilter`) and its
DOM-authoritative filter/selection model, adapting only the React-renderer
wiring to Octane (native events, ref-as-prop, `useId`), and building on
[`@octanejs/radix`](../radix) for the Radix primitives cmdk depends on.

> **Alpha — in progress.** The framework-free scorer and `defaultFilter` are
> available today. The `Command` components land across the phases described in
> [`docs/cmdk-port-plan.md`](../../docs/cmdk-port-plan.md). Track supported
> surface in [`docs/bindings-status.md`](../../docs/bindings-status.md).

## Divergences from React cmdk

Standard Octane binding adaptations (see
[`docs/react-parity-migration-plan.md`](../../docs/react-parity-migration-plan.md)):

- `Command.Input` drives search from the native `onInput` event; the public
  `onValueChange(search)` API is unchanged.
- Components take `ref` as a normal prop (Octane has no `forwardRef`).
- Callbacks (`onSelect`, pointer, keyboard) observe native DOM events.
- Radix `Primitive`/`Slot`/`Dialog`/`useId` come from `@octanejs/radix` and
  `octane`.

## License

MIT. The vendored `command-score` implementation retains its upstream MIT
license.

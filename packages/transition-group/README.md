# @octanejs/transition-group

An Octane binding for [`react-transition-group@4.4.5`](https://github.com/reactjs/react-transition-group/tree/v4.4.5).

## Installation

```sh
npm install @octanejs/transition-group
pnpm add @octanejs/transition-group
```

## Status

The package preserves React Transition Group's six public modules with native Octane components. Timed lifecycle transitions, CSS class phases, keyed group exits, and cloned keyed transitions have executable coverage.

The target public surface is:

- `Transition`
- `CSSTransition`
- `TransitionGroup`
- `SwitchTransition`
- `ReplaceTransition`
- `config`

Root imports and the matching documented per-component imports will be supported. See [UPSTREAM.md](./UPSTREAM.md) for provenance, current gaps, and intentional Octane constraints.

Use `nodeRef` for DOM-aware transitions. Octane intentionally has no `findDOMNode` equivalent. Pass dynamic `TransitionGroup` collections as an inspectable value, such as `children={items.map(...)}`.

## License

BSD-3-Clause. The pinned upstream notice is retained in [LICENSE](./LICENSE).

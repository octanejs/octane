# @octanejs/base-ui

[Base UI](https://base-ui.com) (`@base-ui/react`) ported to the
[octane](https://github.com/octanejs/octane) renderer — headless, accessible, unstyled
UI primitives.

Alpha, in progress. Ported at full fidelity from the pinned `mui/base-ui` source
(`v1.6.0`), proven by differential parity tests against the real
`@base-ui/react`. See `docs/base-ui-migration-plan.md` for the phased plan
and progress.

## API

Mirrors Base UI's deep-subpath imports:

```ts
import { Separator } from '@octanejs/base-ui/separator';
import { useRender } from '@octanejs/base-ui/use-render';
import { mergeProps } from '@octanejs/base-ui/merge-props';
```

Every component takes Base UI's universal composition props — `render` (a JSX element or
`(props, state) => element`), `className` (string or `(state) => string`), and `style`
(object or `(state) => object`) — routed through `useRenderElement`.

## Intentional divergences from Base UI (React)

- **Native events, not synthetic.** Handlers receive native DOM events (octane delegates
  natively). `event.preventBaseUIHandler()` still works — the shim is attached to the
  native event.
- **ref-as-prop.** No `forwardRef`; `ref` is a normal prop (React-19 shape).
- **`className` composition** follows octane's `normalizeClass` at the apply site; the
  `render`-prop merge concatenates strings exactly like Base UI.

# @octanejs/puck

Octane binding for [`@measured/puck`](https://www.npmjs.com/package/@measured/puck) — visual page builders and drag-and-drop CMS editing.

## Usage

```tsx
import { Render, Puck, type Config } from '@octanejs/puck';

const config: Config = {
  components: {
    HeadingBlock: {
      fields: { title: { type: 'text' } },
      render: function renderHeading(props) {
        return <h1>{props.title as string}</h1>;
      },
    },
  },
};

// Read-only render path (working)
<Render config={config} data={data} />

// Full editor shell — mount currently blocked (see Known differences)
<Puck config={config} data={data} />
```

Re-port upstream source after updates:

```bash
pnpm port:upstream   # from packages/puck
```

## Compatibility

Pinned to `@measured/puck@0.20.2`. Source ported from `packages/core` via `scripts/port-upstream.mjs`.

Requires `@dnd-kit/*@0.1.18` (Puck's pinned version, distinct from the workspace catalog's 0.5.x).

## Known differences

- **Full `<Puck>` editor mount** — throws Octane de-opt reconciler error (`component descriptor reached the de-opt host reconciler`). The read-only `<Render>` path works; editor shell needs investigation (likely dynamic component refs in DropZone/DragDropContext).
- **Controlled text inputs** — `ExternalInput` search field uses React-style `onChange`; Octane expects `onInput` for per-edit updates on controlled text hosts.

## Tests

```bash
pnpm vitest run --project puck
```

Organized per the hook-form / react-parity contract:

- `tests/conformance/` — exports + Render smoke test
- `tests/differential/` — Octane vs React oracle (project configured; fixtures pending editor mount fix)

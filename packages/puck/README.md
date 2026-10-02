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

// Full editor shell
<Puck config={config} data={data} />
```

Re-port upstream source after updates:

```bash
bun run port:upstream <path-to-puck>/packages/core   # from packages/puck
```

## Compatibility

Pinned to `@measured/puck@0.20.2`. Source ported from `packages/core` via `scripts/port-upstream.mjs`.

Runs on the workspace catalog's `@dnd-kit/*@0.5.0` through `@octanejs/dnd-kit`. Puck 0.20.2 targets 0.1.18, so the port moves its pointer activation constraints, drag event handler types, and sortable clone feedback to the 0.5 APIs.

## Known differences

- **Controlled text inputs** — `ExternalInput` search field uses React-style `onChange`; Octane expects `onInput` for per-edit updates on controlled text hosts.

## Tests

```bash
bunx vitest run --project puck
```

Organized per the hook-form / react-parity contract:

- `tests/conformance/` — exports, Render and editor smoke tests, and the Octane adaptation contract (refs, fields, sensors, iframe preview)
- `tests/differential/` — Octane vs React oracle (project configured; fixtures pending)

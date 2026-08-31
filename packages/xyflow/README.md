# @octanejs/xyflow

Octane binding for [`@xyflow/react`](https://www.npmjs.com/package/@xyflow/react) — node-based graphs and flow editors (React Flow).

## Installation

```sh
npm install @octanejs/xyflow
pnpm add @octanejs/xyflow
```

## Usage

```tsx
// Scaffold — exports will land as the port progresses.
import {} from '@octanejs/xyflow';
```

## Compatibility

Pinned to `@xyflow/react@12.11.2`.

## Known differences

None documented yet.

## Tests

Organized per the hook-form / react-parity contract:

- `tests/conformance/` — package-authored contract tests (ordinary CI shards)
- `tests/differential/` — Octane vs React oracle (dedicated project + `globalSetup`)
- Vitest projects declare `testExecution.group: 'react-parity'` on parity-owned lanes

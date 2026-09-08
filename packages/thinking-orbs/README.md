# @octanejs/thinking-orbs

Octane binding for [`thinking-orbs`](https://www.npmjs.com/package/thinking-orbs) — dotted thought-orb loading indicators for AI and agent UIs.

```sh
npm install @octanejs/thinking-orbs
pnpm add @octanejs/thinking-orbs
```

## Usage

```tsx
import { ThinkingOrb } from '@octanejs/thinking-orbs';

function Status() {
  return <ThinkingOrb state="searching" size={64} />;
}
```

## Compatibility

Pinned to `thinking-orbs@0.2.0`. The framework-neutral canvas engine is reused verbatim; `ThinkingOrb` is reimplemented in `.tsrx`.

## Known differences

None documented yet.

## Tests

Organized per the hook-form / react-parity contract:

- `tests/conformance/` — package-authored contract tests (ordinary CI shards)
- `tests/differential/` — Octane vs React oracle (dedicated project + `globalSetup`)
- Vitest projects declare `testExecution.group: 'react-parity'` on parity-owned lanes

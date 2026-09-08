# @octanejs/blocknote

Octane binding for [`@blocknote/react`](https://www.npmjs.com/package/@blocknote/react) — block-based rich text editors.

## Usage

```tsx
import {
  BlockNoteContext,
  useBlockNoteContext,
  useBlockNoteEditor,
  useCreateBlockNote,
} from '@octanejs/blocknote';
```

## Compatibility

Pinned to `@blocknote/react@0.53.0`. Reuses `@blocknote/core` unchanged; React binding reimplemented on Octane with `@octanejs/tiptap` at the editor boundary.

### Milestone 1 exports

- `useCreateBlockNote`
- `useBlockNoteEditor`
- `BlockNoteContext` / `useBlockNoteContext`

Only the four authored modules behind these exports are included by the package
files allowlist and checked by the package's CI typecheck. The rest of the
mechanical port remains private staging source until later milestones make it
part of the supported surface.

### Mechanical port

```bash
pnpm port-upstream   # from packages/blocknote — copies upstream src with transforms
```

Review files flagged `CHECKPOINT` in `scripts/port-upstream.mjs` before shipping milestone 1.

## Known differences

None documented yet.

## Tests

Organized per the hook-form / react-parity contract:

- `tests/conformance/` — package-authored contract tests (ordinary CI shards)
- `tests/differential/` — Octane vs React oracle (dedicated project + `globalSetup`)
- Vitest projects declare `testExecution.group: 'react-parity'` on parity-owned lanes

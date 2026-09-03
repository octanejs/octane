# Type parity assertions

`@tiptap/react@3.28.0` ships no dedicated type-test suite for the adapter
surface this binding ports, so both sides of this lane are port-authored.
The two files assert the same public-surface claims: one against the published
upstream binding compiled with `tsc`, one against `@octanejs/tiptap` compiled
with `tsrx-tsc`.

The authored binding and adapted probes must not import React. The
`tests/unit/react-import-boundary.test.ts` guard enforces that boundary directly;
the type program permits Octane's own transitive migration type dependencies.

Executable structural verification lives in
`scripts/react-parity/tiptap-types-lib.mjs` and is wired through
`pnpm react-parity:validate` / `pnpm react-parity:check`. Inventories are
`packages/tiptap/audit/pristine-types.json` and
`packages/tiptap/audit/adapted-types.json`; regenerate with
`node scripts/react-parity/tiptap-types.mjs --write`.

Permitted differences between the two files, and nothing else:

| # | Transformation | Why |
| --- | --- | --- |
| 1 | import root `@tiptap/react` → `@octanejs/tiptap` | the package under test |
| 2 | menus import `@tiptap/react/menus` → `@octanejs/tiptap/menus` | matching menus entry |
| 3 | `ReactNode` → `OctaneNode` (and `react` → `octane`) | adapted side must not import React types |
| 4 | compiler `tsc` (pristine) vs `tsrx-tsc` (adapted) | adapted program imports `.tsrx` modules |

Every assertion group below appears in both files under the same heading and is
hashed into the type inventories (exact `Expect`/`Equal`/`NotAny` aliases plus
the shared `@ts-expect-error` control).

1. `UseEditorOptions` accepts starter options.
2. `useEditor` returns exact `Editor` (rejects erased `any`).
3. `useCurrentEditor().editor` is exact `Editor | null` (rejects erased `any`).
4. `useEditorState` selector result is exact `string` (rejects erased `any`).
5. `EditorContent` accepts the constructed props on its callable signature (concrete non-`any`/`never` result via `ApplyProps`+`ConcreteResult`).
6. `BubbleMenu` / `FloatingMenu` accept the constructed props on their callable signatures (concrete non-`any`/`never` results via `ApplyProps`+`ConcreteResult`).
7. Unknown `UseEditorOptions` keys are rejected.

Octane-only declaration contracts (`useTiptap`, node/mark views, `ReactRenderer`,
rich menu event pins, and similar) stay in `typetests/public-api.test-d.ts` and
`typetests/menus-api.test-d.ts` outside this parity lane.

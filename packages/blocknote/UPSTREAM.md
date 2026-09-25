# Upstream relationship

`@octanejs/blocknote` integrates the public API of `@blocknote/core@0.53.0` as an
ordinary runtime dependency.

- Package: `@blocknote/core@0.53.0`
- Published Git identity: `37614ab348dcc7faa830a9a88437b37197a2162d`
- License: MPL-2.0, distributed by the dependency itself
- Public contract used: `BlockNoteEditor.create`, `mount`, `unmount`,
  `isEditable`, `onChange`, and `onSelectionChange`

## Release blocker: retained port provenance

The package remains private. It must not currently be described or released as
an entirely independently authored, MIT-only implementation.

`src/editor/BlockNoteContext.ts` and `src/hooks/useBlockNoteEditor.ts` retain code
from the earlier mechanical `@blocknote/react@0.53.0` port. The baseline is commit
`b9b0bc4e561d1ee9efdba9bbb02d8d28d040ad59`; its `status.json` and
`scripts/port-upstream.mjs` record that origin. The current files are recorded as
adapted in `audit/source-ledger.json`, not as independently authored adapters.
That ledger records origin and bytes, not license approval or parity verification.

The included MIT license is intended for independently authored portions; it
does not relicense retained upstream code. Before publication, resolve those
files through an independently authored replacement with defensible provenance,
or obtain approval for a distribution that preserves the applicable upstream
license and notices. Merely changing imports or rewriting syntax does not
establish independent authorship. See the [Mozilla MPL FAQ, questions 9 and 11](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).

The React package's toolbars, menus, schema renderers, and other UI components
are outside this package's supported surface.

`@blocknote/core` exposes Shiki types that use the standard explicit-resource-
management symbols. The package entry references TypeScript's
`esnext.disposable` library so strict source consumers can check that public
dependency graph without disabling library checks. The adapter does not use
those symbols at runtime.

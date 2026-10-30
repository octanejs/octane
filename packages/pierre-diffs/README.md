# @octanejs/pierre-diffs

[`@pierre/diffs/react`](https://github.com/pierrecomputer/pierre/tree/main/packages/diffs) for [Octane](https://github.com/octanejs/octane).
It ports the published React entry of `@pierre/diffs@1.6.1`: the `FileDiff`,
`MultiFileDiff`, `PatchDiff`, `File`, `UnresolvedFile` and `CodeView`
components, `Virtualizer`, the worker-pool and editor providers, and their hooks.
Diff parsing, highlighting, workers, editing and SSR preloading come from
`@pierre/diffs` itself.

## Installation

```bash
npm install @octanejs/pierre-diffs @pierre/diffs
pnpm add @octanejs/pierre-diffs @pierre/diffs
```

## Usage

Import components from `@octanejs/pierre-diffs` where React code imports
`@pierre/diffs/react`, and keep every other `@pierre/diffs` import as it is:

```tsx
import { parseDiffFromFile } from '@pierre/diffs';
import { FileDiff } from '@octanejs/pierre-diffs';

const fileDiff = parseDiffFromFile(oldFile, newFile);

export function Review() @{
	<FileDiff
		fileDiff={fileDiff}
		options={{ diffStyle: 'split' }}
		renderHeaderMetadata={() => <span>{'2 comments'}</span>}
	/>
}
```

Long lists of files render through `CodeView` (controlled with `items`, or
seeded once with `initialItems` and driven through its `ref` handle), or through
`FileDiff`s inside a `Virtualizer`. `WorkerPoolContextProvider` highlights on a
worker pool, and `EditProvider` supplies the editor factory for surfaces with
`edit`. With an existing pool, render the context directly:
`<WorkerPoolContext value={pool}>`. Octane contexts have no `.Provider`.

## Differences from `@pierre/diffs/react`

- `CodeView` takes `ref` as an ordinary prop; there is no `forwardRef`.
- Contexts are their own providers: `<WorkerPoolContext value>`,
  `<EditContext value>`, `<VirtualizerContext value>`.
- Render callbacks return `OctaneNode`.

Everything else, including SSR with `prerenderedHTML` and the declarative shadow
root it renders, behaves as upstream. See `UPSTREAM.md` for the source pin and
parity evidence.

## License

MIT for the port. The adapted `@pierre/diffs` sources are Apache-2.0; the
upstream license ships as `LICENSE.upstream`.

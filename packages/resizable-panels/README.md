# @octanejs/resizable-panels

Octane binding for `react-resizable-panels@4.12.2`.

## Installation

```sh
npm install @octanejs/resizable-panels
pnpm add @octanejs/resizable-panels
```

Install `@octanejs/resizable-panels` and replace the React package import;
the public `Group`, `Panel`, `Separator`, persistence hooks, refs, and imperative
handles retain the pinned upstream contract.

```tsrx
import { Group, Panel, Separator } from '@octanejs/resizable-panels';

export function Workspace() @{
	<Group defaultLayout={{ navigation: 25, content: 75 }}>
		<Panel id="navigation" minSize="15%">Navigation</Panel>
		<Separator aria-label="Resize navigation" />
		<Panel id="content">Content</Panel>
	</Group>
}
```

See [`UPSTREAM.md`](./UPSTREAM.md) for pinned provenance and executable parity
evidence.

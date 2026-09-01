# @octanejs/window

The exact [`react-window@2.3.0`](https://github.com/bvaughn/react-window) API for
the [Octane](https://github.com/octanejs/octane) renderer. Change the package
import and keep the current v2 `List`, `Grid`, sizing, callback, ref, and
imperative-scrolling contracts.

## Installation

```sh
npm install @octanejs/window
pnpm add @octanejs/window
```

```diff
-import { List } from 'react-window';
+import { List } from '@octanejs/window';
```

```tsx
import { Grid, List, type CellComponentProps, type RowComponentProps } from '@octanejs/window';

function Row({ index, style, ariaAttributes }: RowComponentProps) {
	return <div {...ariaAttributes} style={style}>{'Row ' + index}</div>;
}

function Cell({ columnIndex, rowIndex, style, ariaAttributes }: CellComponentProps) {
	return <div {...ariaAttributes} style={style}>{`${rowIndex}:${columnIndex}`}</div>;
}

export function VirtualizedData() @{
	<section>
		<List
			defaultHeight={300}
			rowComponent={Row}
			rowCount={10_000}
			rowHeight={32}
			rowProps={{}}
			style={{ height: 300 }}
		/>
		<Grid
			cellComponent={Cell}
			cellProps={{}}
			columnCount={100}
			columnWidth={100}
			defaultHeight={300}
			defaultWidth={600}
			rowCount={10_000}
			rowHeight={32}
			style={{ height: 300, width: 600 }}
		/>
	</section>
}
```

The package includes all eight v2 runtime exports and all eight public type
exports from the pinned release. Fixed, percentage, function, and dynamic row
sizes; overscan; RTL grids; ARIA attributes; custom root tags; imperative refs;
SSR; and hydration are covered by executable parity evidence.

## Version boundary

This package targets the current `react-window` v2 API. The older v1
`FixedSizeList`, `VariableSizeList`, `FixedSizeGrid`, and `VariableSizeGrid`
names are not exports of `react-window@2.3.0` and are intentionally not added
here. Applications still using those names need a v1-specific migration before
changing imports.

## Renderer differences

Consumer-visible rendering, keyed state, scrolling, measurement, and final DOM
match the React package. Two renderer-internal observations differ:

- Octane reserves the second raw function-component invocation argument for its
  internal block ABI. Tests and instrumentation should assert component props,
  not React's undocumented `undefined` second argument.
- After keyed reordering, sibling effect order and equal-prop rerender counts
  can differ. Do not depend on sibling effect ordering; keyed state and DOM
  identity are preserved.

The pinned source, npm declaration bundle, license, test inventory, allowed
adaptations, and executable pristine/adapted/type/differential/SSR/hydration
lanes are recorded in [`UPSTREAM.md`](./UPSTREAM.md) and
[`audit/react-parity.json`](./audit/react-parity.json).

## License

MIT — contains source derived from
[react-window](https://github.com/bvaughn/react-window) (MIT, © Brian Vaughn),
adapted for Octane.

## Status

Current scope and verification status are tracked in the generated
[bindings status table](../../docs/bindings-status.md), sourced from
[`status.json`](./status.json).

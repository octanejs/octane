// @octanejs/tanstack-table — TanStack Table for the octane renderer.
//
// TanStack Table separates a framework-agnostic core (`@tanstack/table-core`:
// createTable + every feature row model) from a ~100-line React adapter
// (`useReactTable` + `flexRender`). This package reuses the core UNCHANGED
// (re-exported verbatim) and transcribes only the adapter onto octane's hooks,
// preserving upstream's exact useState-based shape — the table instance is
// created once, state lives in a useState whose setter is wired into the
// instance's onStateChange, and options are re-composed into the instance
// during every render. The public surface matches @tanstack/react-table 1:1:
// existing code works by changing the import.
//
// The one octane-specific detail is hook slots: octane keys hooks by a
// compiler-injected per-call-site Symbol, appended as the LAST argument of
// every `use*` call. `useReactTable` forwards that slot into its two useState
// calls (deriving a stable sub-slot for each), so two tables in one component
// stay independent, just like in React.
import { createElement, useState } from 'octane';
import type { ComponentBody, ElementDescriptor } from 'octane';
import { createTable } from '@tanstack/table-core';
import type { RowData, TableOptions, TableOptionsResolved } from '@tanstack/table-core';
import { splitSlot, subSlot } from './internal';

export * from '@tanstack/table-core';

export type Renderable<TProps> =
	| ComponentBody<TProps>
	| ElementDescriptor<any>
	| string
	| number
	| boolean
	| null
	| undefined;

/**
 * If rendering headers, cells, or footers with custom markup, use flexRender
 * instead of `cell.getValue()` or `cell.renderValue()`.
 *
 * Port note: upstream additionally detects class components and
 * `react.memo`/`react.forward_ref` exotic objects. Both branches are dead in
 * octane — there are no class components or forwardRef, and octane's `memo()`
 * returns a plain function — so a component is exactly `typeof === 'function'`.
 * The descriptor `createElement` returns renders at value position (a `.tsrx`
 * hole); non-component values (strings, numbers, pre-created descriptors)
 * pass through as-is.
 */
export function flexRender<TProps extends object>(Comp: Renderable<TProps>, props: TProps) {
	return !Comp
		? null
		: typeof Comp === 'function'
			? createElement(Comp as ComponentBody<TProps>, props)
			: Comp;
}

export function useReactTable<TData extends RowData>(
	options: TableOptions<TData>,
	...rest: unknown[]
) {
	const [, slot] = splitSlot(rest);

	// Compose in the generic options to the user options
	const resolvedOptions: TableOptionsResolved<TData> = {
		state: {}, // Dummy state
		onStateChange: () => {}, // noop
		renderFallbackValue: null,
		...options,
	};

	// Create a new table and store it in state
	const [tableRef] = useState(
		() => ({
			current: createTable<TData>(resolvedOptions),
		}),
		subSlot(slot, 'urt:t'),
	);

	// By default, manage table state here using the table's initial state
	const [state, setState] = useState(() => tableRef.current.initialState, subSlot(slot, 'urt:s'));

	// Compose the default state above with any user state. This will allow the user
	// to only control a subset of the state if desired.
	tableRef.current.setOptions((prev) => ({
		...prev,
		...options,
		state: {
			...state,
			...options.state,
		},
		// Similarly, we'll maintain both our internal state and any user-provided
		// state.
		onStateChange: (updater) => {
			setState(updater);
			options.onStateChange?.(updater);
		},
	}));

	return tableRef.current;
}

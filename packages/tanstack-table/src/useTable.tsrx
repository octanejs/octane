// Authored in .tsrx because it calls slot-keyed hooks (`useState`, `useSelector`,
// `useMemo`) and renders `<Subscribe>` as an element. The types live in
// `./types`, so the `.tsrx.d.ts` sidecar only restates this signature.
import { shallow, useSelector } from '@octanejs/tanstack-store';
import { constructTable } from '@tanstack/table-core';
import { useMemo, useState } from 'octane';
import { FlexRender } from './FlexRender';
import { splitSlot } from './internal';
import { octaneReactivity } from './reactivity';
import { Subscribe } from './Subscribe.tsrx';
import type { RowData, TableFeatures, TableOptions, TableState } from '@tanstack/table-core';
import type { OctaneTable } from './types';

/**
 * Creates an octane table instance backed by TanStack Store atoms.
 *
 * The optional selector projects from `table.store`; the selected value is
 * exposed on `table.state` and compared shallowly to decide re-renders. Omit
 * the selector to subscribe to every registered table state slice, or pass a
 * narrower selector and use `table.Subscribe` lower in the tree for targeted
 * subscriptions.
 *
 * @example
 * ```tsx
 * const table = useTable(
 *   {
 *     features,
 *     columns,
 *     data,
 *   },
 *   (state) => ({ pagination: state.pagination }),
 * )
 *
 * table.state.pagination
 * ```
 */
export function useTable<
	TFeatures extends TableFeatures,
	TData extends RowData,
	TSelected = TableState<TFeatures>,
>(
	tableOptions: TableOptions<TFeatures, TData>,
	// `selector` is optional, so the compiler-injected call-site slot would land
	// in it (`useTable(options)` compiles to `useTable(options, slot)`). Take the
	// rest args and split the slot off before reading the selector.
	...rest: [selector?: (state: TableState<TFeatures>) => TSelected, slot?: symbol]
): OctaneTable<TFeatures, TData, TSelected> {
	const [user] = splitSlot(rest);
	const selector = user[0] as ((state: TableState<TFeatures>) => TSelected) | undefined;

	const [table] = useState(() => {
		// Explicit type arguments skip generic inference from the spread object (a
		// type-check hot spot); the spread only adds the octane reactivity binding
		// to `features`.
		const tableInstance = constructTable<TFeatures, TData>({
			...tableOptions,
			features: {
				coreReactivityFeature: octaneReactivity(),
				...tableOptions.features,
			},
		}) as unknown as OctaneTable<TFeatures, TData, TSelected>;

		// Rendered as an ELEMENT rather than called as a function, so `Subscribe`
		// gets its own component scope and its `useSelector` slot is keyed per
		// mounted `<table.Subscribe>` instead of shared with the caller.
		tableInstance.Subscribe = ((props: any) =>
			<Subscribe {...props} source={props.source ?? tableInstance.store} />) as OctaneTable<
			TFeatures,
			TData,
			TSelected
		>['Subscribe'];

		tableInstance.FlexRender = FlexRender;

		return tableInstance;
	});

	// Sync options on every render, so partially-controlled state and fresh
	// closures (onStateChange, columns, data) land before any read below.
	table.setOptions(
		(prev) => ({
			...prev,
			...tableOptions,
		}),
	);

	const state = useSelector(table.store, selector, { compare: shallow });

	// A fresh object every render is deliberate: `state` and `options` must be
	// the values read during THIS render, and the compiler needs a stable
	// dependency list rather than a mutated instance.
	return useMemo(
		() => ({
			...table,
			options: tableOptions,
			state,
		}),
		[table, tableOptions, state],
	) as OctaneTable<TFeatures, TData, TSelected>;
}

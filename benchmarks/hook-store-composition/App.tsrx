import { useCallback, useEffect, useSyncExternalStore } from 'octane';
import { useStoreWithEqualityFn } from '@octanejs/zustand/traditional';
import { observer } from '@octanejs/mobx';
import { ROW_INDICES, isCallbackLane } from './contract.mjs';
import { useNestedCallback } from './callback-hooks.tsrx';
import type { BenchmarkModel, Callback, Lane } from './model';

type RowProps = {
	model: BenchmarkModel;
	index: number;
	generation: number;
	value: number;
	dependencies: number[];
	alternate: boolean;
};

function DirectCallbackRow(props: RowProps) @{
	// A nonliteral dependency-array expression keeps this on the public runtime
	// hook path under the normal production compiler options.
	const report = props.model.reportCallback;
	const index = props.index;
	const value = props.value;
	const dependencies = props.dependencies;
	const callback: Callback = useCallback(
		() => report(index, value + index, callback),
		dependencies,
	);
	<button
		type="button"
		data-row-index={String(props.index)}
		data-generation={String(props.generation)}
		onClick={callback}
	>{String(props.value + props.index) as string}</button>
}

function NestedCallbackRow(props: RowProps) @{
	const callback = useNestedCallback(
		props.model.reportCallback,
		props.index,
		props.value,
		props.dependencies,
	);
	<button
		type="button"
		data-row-index={String(props.index)}
		data-generation={String(props.generation)}
		onClick={callback}
	>{String(props.value + props.index) as string}</button>
}

function RawStoreRow(props: RowProps) @{
	const read = props.model.rawReaders[props.index];
	const value = useSyncExternalStore(props.model.api.subscribe, read, read);
	<output data-row-index={String(props.index)} data-generation={String(props.generation)}>{String(
		value,
	) as string}</output>
}

function ZustandRow(props: RowProps) @{
	const selectors = props.alternate ? props.model.alternateSelectors : props.model.selectors;
	const selection = useStoreWithEqualityFn(
		props.model.api,
		selectors[props.index],
		props.model.equalSelection,
	);
	<output data-row-index={String(props.index)} data-generation={String(props.generation)}>{String(
		selection.value,
	) as string}</output>
}

function MobxRowBody(props: RowProps) @{
	const selection = props.model.mobxSelections[props.index].get();
	<output data-row-index={String(props.index)} data-generation={String(props.generation)}>{String(
		selection.value,
	) as string}</output>
}
const MobxRow = observer(MobxRowBody);

export type CallbackSiteControlProps = {
	report: BenchmarkModel['reportCallback'];
	left: number;
	right: number;
	dependencies: number[];
	generation: number;
};

// Two call sites in ONE component scope must not alias the leaf's memo cell,
// even when their dependency values are equal. This control is mounted and
// clicked only outside the measured application root.
export function CallbackSiteControl(props: CallbackSiteControlProps) @{
	const left = useNestedCallback(props.report, 0, props.left, props.dependencies);
	const right = useNestedCallback(props.report, 1, props.right, props.dependencies);
	<div data-control-generation={String(props.generation)}>
		<button type="button" data-control="left" onClick={left}>left</button>
		<button type="button" data-control="right" onClick={right}>right</button>
	</div>
}

function StoreReady(props: { model: BenchmarkModel }) @{
	useEffect(() => {
		props.model.setReady(true);
		return () => props.model.setReady(false);
	}, [props.model]);
	<span hidden />
}

export type AppProps = Omit<RowProps, 'index'> & { lane: Lane };

export function App(props: AppProps) @{
	const Row =
		props.lane === 'callback-direct'
			? DirectCallbackRow
			: props.lane === 'callback-nested'
				? NestedCallbackRow
				: props.lane === 'raw-store'
					? RawStoreRow
					: props.lane === 'zustand-traditional'
						? ZustandRow
						: MobxRow;
	<main>
		@for (const index of ROW_INDICES; key index) {
			<Row
				model={props.model}
				index={index}
				generation={props.generation}
				value={props.value}
				dependencies={props.dependencies}
				alternate={props.alternate}
			/>
		}
		@if (!isCallbackLane(props.lane)) {
			<StoreReady model={props.model} />
		}
	</main>
}

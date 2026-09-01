import { flushSync, useState } from 'octane';

interface RowsProps {
	count: number;
}

interface ForeignRowsProps extends RowsProps {
	onRender(index: number, value: number): void;
}

const foreignUpdates: Array<() => void> = [];

function ForeignRow(props: { index: number; onRender(index: number, value: number): void }) {
	const [value, setValue] = useState(0);
	props.onRender(props.index, value);
	foreignUpdates[props.index] = () => setValue(1);
	return <output data-foreign-row={String(props.index)}>{'foreign:' + value}</output>;
}

function SettlingRow(props: { index: number; settle: boolean }) {
	const [value, setValue] = useState(props.settle ? 0 : 2);
	if (props.settle && value < 2) setValue(value + 1);
	return <button data-settling-row={String(props.index)} onClick={() => setValue(value + 1)}>
		{'target:' + value}
	</button>;
}

export function ForeignRows(props: ForeignRowsProps) @{
	const rows = Array.from({ length: props.count }, (_, index) => index);
	foreignUpdates.length = 0;
	<section>
		@for (const index of rows; key index) {
			<ForeignRow index={index} onRender={props.onRender} />
		}
	</section>
}

export function SettlingRows(props: RowsProps & { settle: boolean }) @{
	const rows = Array.from({ length: props.count }, (_, index) => index);
	<section>
		@for (const index of rows; key index) {
			<SettlingRow index={index} settle={props.settle} />
		}
	</section>
}

export function Runaway(props: { runaway: boolean }) {
	const [value, setValue] = useState(props.runaway ? 0 : 25);
	if (props.runaway) setValue(value + 1);
	return <output data-runaway="">{'runaway:' + value}</output>;
}

export function Aborting(props: { abort: boolean; queueForeign(): void }) {
	const [value, setValue] = useState(props.abort ? 0 : 1);
	if (props.abort && value === 0) {
		setValue(1);
		props.queueForeign();
	}
	if (props.abort && value === 1) throw new Error('hydration queue abort');
	return <output data-aborting="">{'aborting:' + value}</output>;
}

export function NestedFlush(props: { flush: boolean }) {
	const [value, setValue] = useState(props.flush ? 0 : 1);
	if (props.flush && value === 0) setValue(1);
	if (props.flush && value === 1) flushSync(() => {});
	return <output data-nested-flush="">{'nested-flush:' + value}</output>;
}

export function queueForeignUpdates(count: number): void {
	if (foreignUpdates.length !== count) {
		throw new Error(`Expected ${count} foreign rows, received ${foreignUpdates.length}.`);
	}
	for (let index = 0; index < count; index++) foreignUpdates[index]();
}

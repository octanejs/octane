import { useState } from 'octane';

interface RowsProps {
	count: number;
}

const foreignUpdates: Array<() => void> = [];

function ForeignRow(props: { index: number }) {
	const [value, setValue] = useState(0);
	foreignUpdates[props.index] = () => setValue(1);
	return <output data-hydration-queue-foreign-row={String(props.index)}>
		{'foreign:' + value}
	</output>;
}

function TargetRow(props: { index: number; settle: boolean }) {
	const [value, setValue] = useState(props.settle ? 0 : 2);
	if (props.settle && value < 2) setValue(value + 1);
	return <button
		data-hydration-queue-target-row={String(props.index)}
		onClick={() => setValue(value + 1)}
	>
		{'target:' + value}
	</button>;
}

export function ForeignRows(props: RowsProps) @{
	const rows = Array.from({ length: props.count }, (_, index) => index);
	foreignUpdates.length = 0;
	<section data-hydration-queue-foreign="">
		@for (const index of rows; key index) {
			<ForeignRow index={index} />
		}
	</section>
}

export function TargetRows(props: RowsProps & { settle: boolean }) @{
	const rows = Array.from({ length: props.count }, (_, index) => index);
	<section data-hydration-queue-target="">
		@for (const index of rows; key index) {
			<TargetRow index={index} settle={props.settle} />
		}
	</section>
}

export function queueForeignUpdates(count: number): void {
	if (foreignUpdates.length !== count) {
		throw new Error(`Expected ${count} mounted foreign rows, received ${foreignUpdates.length}.`);
	}
	for (let index = 0; index < count; index++) foreignUpdates[index]();
}

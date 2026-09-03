import { Activity, createElement, createPortal, useEffect, useReducer, useState } from 'octane';

type Props = { log: (value: string) => void; rejectZero?: boolean };

function Child({ value, log, rejectZero }: Props & { value: number }) @{
	log('child render ' + value);
	if (rejectZero && value === 0) throw new Error('discarded child');
	const [initial] = useState(value);
	useEffect(() => {
		log('effect ' + value);
	}, [value]);
	<output>{String(value) + ':' + String(initial)}</output>
}

export function DirectSelfUpdate(props: Props) @{
	const [value, setValue] = useState(0);
	props.log('parent render ' + value);
	if (value === 0) setValue(5);
	<Child value={value} log={props.log} rejectZero={props.rejectZero} />
}

export function ReturnedSelfUpdate(props: Props) {
	const [value, setValue] = useState(0);
	props.log('parent render ' + value);
	if (value === 0) setValue(5);
	return createElement(Child, { value, log: props.log, rejectZero: props.rejectZero });
}

export function InlineSelfUpdate(props: Props) @{
	const [value, setValue] = useState(0);
	<Child
		value={value === 0 ? (setValue(5), value) : value}
		log={props.log}
		rejectZero={props.rejectZero}
	/>
}

export function BranchSelfUpdate(props: Props) @{
	const [value, setValue] = useState(0);
	if (value === 0) setValue(5);
	@if (value >= 0) {
		<Child value={value} log={props.log} rejectZero={props.rejectZero} />
	}
}

export function ListSelfUpdate(props: Props) @{
	const [value, setValue] = useState(0);
	if (value === 0) setValue(5);
	<div>
		@for (const item of [1, 2]; key item) {
			<Child value={value} log={props.log} rejectZero={props.rejectZero} />
		}
	</div>
}

export function InlineListSelfUpdate(props: Props) @{
	const [value, setValue] = useState(0);
	<div>
		@for (const item of value === 0 ? (setValue(5), [1, 2]) : [1, 2]; key item) {
			<Child value={value} log={props.log} rejectZero={props.rejectZero} />
		}
	</div>
}

export function InlineActivitySelfUpdate(props: Props) @{
	const [value, setValue] = useState(0);
	<Activity mode={value === 0 ? (setValue(5), 'visible') : 'visible'}>
		<Child value={value} log={props.log} rejectZero={props.rejectZero} />
	</Activity>
}

export function ReducerSelfUpdate(props: Props) @{
	const [value, dispatch] = useReducer((_: number, next: number) => next, 0);
	if (value === 0) dispatch(5);
	<Child value={value} log={props.log} rejectZero={props.rejectZero} />
}

function SingleHostSelfUpdate(props: Props) @{
	const [value, setValue] = useState(0);
	if (value === 0) setValue(5);
	<section>
		<Child value={value} log={props.log} rejectZero={props.rejectZero} />
	</section>
}

export function NestedSelfUpdate(props: Props) @{
	<div>
		<span>before</span>
		<SingleHostSelfUpdate log={props.log} />
		<span>after</span>
	</div>
}

export function PropDerivedSelfUpdate(props: Props & { target: number }) @{
	const [value, setValue] = useState(props.target);
	if (value !== props.target) setValue(props.target);
	<div>
		@if (value === props.target) {
			<Child value={value} log={props.log} />
		}
	</div>
}

export function InlineBranchSelfUpdate(props: Props & { target: number }) @{
	const [value, setValue] = useState(props.target);
	<div>
		@if (value !== props.target ? (setValue(props.target), false) : true) {
			<Child value={value} log={props.log} />
		}
	</div>
}

export function MultipleSelfUpdates() @{
	const [first, setFirst] = useState(0);
	const [second, setSecond] = useState(0);
	if (first === 0) {
		setFirst(5);
		setSecond((previous) => previous + 2);
	}
	<output>{String(first) + ':' + String(second)}</output>
}

export function InlinePortalSelfUpdate(props: Props & { target: Element }) @{
	const [value, setValue] = useState(0);
	<div>{createPortal(
		<Child value={value} log={props.log} rejectZero={props.rejectZero} />,
		value === 0 ? (setValue(5), props.target) : props.target,
	)}</div>
}

type Row = { id: number; label: string };

export function InlineHostForSelfUpdate(props: { items: Row[] }) @{
	const [selected, setSelected] = useState(0);
	const items = props.items;
	<ul data-selected={selected === 0 ? (setSelected(1), selected) : selected}>
		@for (const row of items; key row.id) {
			<li class={selected === row.id ? 'selected' : ''}>{row.label as string}</li>
		}
	</ul>
}

export function InlineHostMapSelfUpdate(props: { items: Row[] }) @{
	const [selected, setSelected] = useState(0);
	<ul data-selected={selected === 0 ? (setSelected(1), selected) : selected}>{props.items.map(
		(row) =>
			<li key={row.id} class={selected === row.id ? 'selected' : ''}>{row.label as string}</li>,
	)}</ul>
}

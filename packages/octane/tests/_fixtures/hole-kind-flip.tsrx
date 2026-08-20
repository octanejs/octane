// Value holes that switch between primitives, empty values, components, hosts,
// and keyed arrays. Round-tripping back to an array must remount items cleanly
// every cycle.
//
// Where a flip target is JSX, it is assigned in setup: a statically JSX-armed
// ternary lowers to an @if-style block instead of the value hole under test.

import { useLayoutEffect, useState, type OctaneNode } from 'octane';

function Chip() @{
	<b>{'chip'}</b>
}

export function HoleKindRoundTrip() @{
	const [mode, setMode] = useState(0);
	const rows =
		mode % 2 === 0 ? ['a', 'b'] : null;
	<div>
		<button id="next" onClick={() => setMode(mode + 1)}>{'next'}</button>
		<div id="host">
			{rows === null ? 'plain' : rows.map((id) => <i key={id}>{id as string}</i>)}
		</div>
	</div>
}

export function ArrayNullRoundTrip() @{
	const [mode, setMode] = useState(0);
	const rows =
		mode % 2 === 0 ? ['a', 'b'] : null;
	<div>
		<button id="next" onClick={() => setMode(mode + 1)}>{'next'}</button>
		<div id="host">
			{rows === null ? null : rows.map((id) => <i key={id}>{id as string}</i>)}
		</div>
	</div>
}

export function ArrayComponentRoundTrip() @{
	const [mode, setMode] = useState(0);
	let content;
	if (mode % 2 === 0) {
		content = ['a', 'b'].map((id) => <i key={id}>{id as string}</i>);
	} else {
		content = <Chip />;
	}
	<div>
		<button id="next" onClick={() => setMode(mode + 1)}>{'next'}</button>
		<div id="host">{content}</div>
	</div>
}

export function ArrayHostRoundTrip() @{
	const [mode, setMode] = useState(0);
	let content;
	if (mode % 2 === 0) {
		content = ['a', 'b'].map((id) => <i key={id}>{id as string}</i>);
	} else {
		content = <em>{'solo'}</em>;
	}
	<div>
		<button id="next" onClick={() => setMode(mode + 1)}>{'next'}</button>
		<div id="host">{content}</div>
	</div>
}

export function OnlyValue(props: { value: OctaneNode }) @{
	<main id="value-host">{props.value}</main>
}

export function SiblingValue(props: { value: OctaneNode }) @{
	<main id="value-host">
		<span data-static="before">before|</span>
		{props.value}
		<span data-static="after">|after</span>
	</main>
}

export function OnlyStringValue(props: { value: unknown }) @{
	<main id="value-host">{String(props.value)}</main>
}

export function SiblingStringValue(props: { value: unknown }) @{
	<main id="value-host">
		<span data-static="before">before|</span>
		{String(props.value)}
		<span data-static="after">|after</span>
	</main>
}

export function OnlyTypedValue(props: { value: unknown }) @{
	<main id="value-host">{props.value as string}</main>
}

export function SiblingTypedValue(props: { value: unknown }) @{
	<main id="value-host">
		<span data-static="before">before|</span>
		{props.value as string}
		<span data-static="after">|after</span>
	</main>
}

export function StatefulValue(props: { id: string; log: (entry: string) => void }) @{
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.log('mount ' + props.id);
		return () => props.log('unmount ' + props.id);
	}, []);
	<button data-child={props.id} onClick={() => setCount(count + 1)}>
		{props.id + ':' + count}
	</button>
}

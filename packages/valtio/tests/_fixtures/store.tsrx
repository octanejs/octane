import { useState } from 'octane';
import { useSnapshot } from '@octanejs/valtio';
import { useProxy } from '@octanejs/valtio/react/utils';

type CounterState = {
	count: number;
	other: number;
	profile: {
		name: string;
	};
};

export function Counter(props: { state: CounterState }) @{
	const snap = useSnapshot(props.state);
	<div>
		<span id="count">{snap.count as string}</span>
		<button id="increment" onClick={() => props.state.count++}>increment</button>
	</div>
}

export function NestedValue(props: { state: CounterState }) @{
	const snap = useSnapshot(props.state);
	<span id="name">{snap.profile.name}</span>
}

export function TwoStores(props: {
	left: CounterState;
	right: CounterState;
}) @{
	const left = useSnapshot(props.left);
	const right = useSnapshot(props.right);
	<div>
		<span id="left">{left.count as string}</span>
		<span id="right">{right.count as string}</span>
	</div>
}

export function SyncCounter(props: { state: CounterState }) @{
	const snap = useSnapshot(props.state, { sync: true });
	<span id="sync-count">{snap.count as string}</span>
}

export function SwitchingValue(props: { state: CounterState }) @{
	const [showOther, setShowOther] = useState(false);
	const snap = useSnapshot(props.state);
	<div>
		<span id="selected">{(showOther ? snap.other : snap.count) as string}</span>
		<button id="show-other" onClick={() => setShowOther(true)}>show other</button>
	</div>
}

export function MutableProxy(props: { state: CounterState }) @{
	const state = useProxy(props.state);
	<button id="proxy-count" onClick={() => state.count++}>{state.count as string}</button>
}

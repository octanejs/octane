import { useState } from 'octane';
import { Observer, observer, useLocalObservable, useObserver } from '@octanejs/mobx';

type Store = {
	count: number;
	other: number;
	nested: { label: string };
};

export function CallbackRegion(props: { store: Store }) @{
	<Observer>
		{() => <span id="callback-count">{String(props.store.count)}</span>}
	</Observer>
}

export function CallbackHook(props: { store: Store }) {
	return useObserver(() => <span id="callback-count">{String(props.store.count)}</span>);
}

export const CallbackObserver = observer(
	(props: { store: Store }) => <span id="callback-count">{String(props.store.count)}</span>,
);

function CounterBody(props: { store: Store; rendered: () => void }) @{
	props.rendered();
	<div>
		<span id="count">{String(props.store.count)}</span>
		<button id="increment" onClick={() => props.store.count++}>increment</button>
	</div>
}
export const Counter = observer(CounterBody);

function NestedValueBody(props: { store: Store }) @{
	<span id="nested">{props.store.nested.label}</span>
}
export const NestedValue = observer(NestedValueBody);

function SwitchingValueBody(props: { store: Store }) @{
	const [other, setOther] = useState(false);
	<div>
		<span id="selected">{String((other ? props.store.other : props.store.count))}</span>
		<button id="switch" onClick={() => setOther(true)}>switch</button>
	</div>
}
export const SwitchingValue = observer(SwitchingValueBody);

function LocalObservableBody() @{
	const store = useLocalObservable(
		() => ({
			count: 0,
			increment() {
				this.count++;
			},
		}),
	);
	<button id="local" onClick={store.increment}>{String(store.count)}</button>
}
export const LocalObservable = observer(LocalObservableBody);

function TwoCountersBody(props: {
	left: Store;
	right: Store;
}) @{
	<div>
		<span id="left">{String(props.left.count)}</span>
		<span id="right">{String(props.right.count)}</span>
	</div>
}
export const TwoCounters = observer(TwoCountersBody);

function ServerCounterBody(props: { store: Store }) @{
	<span id="server-count">{String(props.store.count)}</span>
}
export const ServerCounter = observer(ServerCounterBody);

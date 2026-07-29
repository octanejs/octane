import { useState } from 'octane';
import { observer, useLocalObservable } from '@octanejs/mobx';

type Store = {
	count: number;
	other: number;
	nested: { label: string };
};

function CounterBody(props: { store: Store; rendered: () => void }) @{
	props.rendered();
	<div>
		<span id="count">{props.store.count as string}</span>
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
		<span id="selected">{(other ? props.store.other : props.store.count) as string}</span>
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
	<button id="local" onClick={store.increment}>{store.count as string}</button>
}
export const LocalObservable = observer(LocalObservableBody);

function TwoCountersBody(props: {
	left: Store;
	right: Store;
}) @{
	<div>
		<span id="left">{props.left.count as string}</span>
		<span id="right">{props.right.count as string}</span>
	</div>
}
export const TwoCounters = observer(TwoCountersBody);

function ServerCounterBody(props: { store: Store }) @{
	<span id="server-count">{props.store.count as string}</span>
}
export const ServerCounter = observer(ServerCounterBody);

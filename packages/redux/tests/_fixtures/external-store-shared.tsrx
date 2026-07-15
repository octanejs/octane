import { useSyncExternalStoreWithSelector } from '@octanejs/redux';
import { useLayoutEffect } from 'octane';

export function createExternalStore(initialState) {
	let currentState = initialState;
	const listeners = new Set();
	return {
		set(nextState) {
			currentState = nextState;
			for (const listener of [...listeners]) listener();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getState() {
			return currentState;
		},
	};
}

function selectA(state) {
	return state.a;
}

export function SelectedValueReader(props) @{
	const value = useSyncExternalStoreWithSelector(
		props.store.subscribe,
		props.store.getState,
		null,
		selectA,
	);
	<span id="selected-value">
		{value as number}
	</span>
}

function selectAObject(state) {
	return { value: state.a };
}

function selectBObject(state) {
	return { value: state.b };
}

function equalSelection(left, right) {
	return left.value === right.value;
}

function EqualityA(props) @{
	const selection = useSyncExternalStoreWithSelector(
		props.store.subscribe,
		props.store.getState,
		null,
		selectAObject,
		equalSelection,
	);
	useLayoutEffect(() => {
		props.probe.value = 'A' + selection.value;
	}, null);
	<span id="equality-a">
		{'A' + selection.value}
	</span>
}

function EqualityB(props) @{
	const selection = useSyncExternalStoreWithSelector(
		props.store.subscribe,
		props.store.getState,
		null,
		selectBObject,
		equalSelection,
	);
	useLayoutEffect(() => {
		props.probe.value = 'B' + selection.value;
	}, null);
	<span id="equality-b">
		{'B' + selection.value}
	</span>
}

export function EqualityPair(props) @{
	<div>
		<EqualityA store={props.store} probe={props.aProbe} />
		<EqualityB store={props.store} probe={props.bProbe} />
	</div>
}

export function ChangingSelectorReader(props) @{
	const inlineSelector = (state) => ({
		items: [...state.items, 'C'],
		selectedAtStep: props.step,
	});
	const selection = useSyncExternalStoreWithSelector(
		props.store.subscribe,
		props.store.getState,
		null,
		inlineSelector,
		(left, right) =>
			left.items.length === right.items.length &&
				left.items.every((item, index) => item === right.items[index]),
	);
	useLayoutEffect(() => {
		props.selectionProbe.value = selection.items.join(',') + '|selected:' +
		selection.selectedAtStep;
	}, [selection]);
	<div>
		<span id="changing-selection">
			{selection.items.join(',') + '|selected:' + selection.selectedAtStep}
		</span>
		<span id="changing-selector-step">
			{props.step as string}
		</span>
	</div>
}

function ThrowingSelectorReader(props) @{
	const value = useSyncExternalStoreWithSelector(
		props.store.subscribe,
		props.store.getState,
		null,
		(state) => {
			if (typeof state.a !== 'string') throw new TypeError('Malformed state');
			return state.a.toUpperCase();
		},
	);
	<span id="selector-value">
		{value as string}
	</span>
}

export function SelectorErrorBoundary(props) @{
	@try {
		<ThrowingSelectorReader store={props.store} />
	} @catch (error) {
		<span id="selector-error">
			{error.message as string}
		</span>
	}
}

function ThrowingEqualityReader(props) @{
	const value = useSyncExternalStoreWithSelector(
		props.store.subscribe,
		props.store.getState,
		null,
		(state) => state.a,
		(left, right) => {
			if (typeof left !== 'string' || typeof right !== 'string') {
				throw new TypeError('Malformed state');
			}
			return left.trim() === right.trim();
		},
	);
	<span id="equality-value">
		{value as string}
	</span>
}

export function EqualityErrorBoundary(props) @{
	@try {
		<ThrowingEqualityReader store={props.store} />
	} @catch (error) {
		<span id="equality-error">
			{error.message as string}
		</span>
	}
}

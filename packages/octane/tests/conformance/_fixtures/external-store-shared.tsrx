import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'octane';

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
		getSubscriberCount() {
			return listeners.size;
		},
	};
}

export const controls = {
	setStore: null,
	setStep: null,
	setGetSnapshot: null,
};

export function BasicReader(props) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.getState);
	useLayoutEffect(() => {
		if (props.commitProbe) props.commitProbe.value = value;
	}, null);
	<span id="basic-store-value">{value as string}</span>
}

export function SwappableReader(props) @{
	const [store, setStore] = useState(props.store);
	controls.setStore = setStore;
	const value = useSyncExternalStore(store.subscribe, store.getState);
	<span id="swappable-store-value">{value as string}</span>
}

function SelectedA(props) @{
	const value = useSyncExternalStore(props.store.subscribe, () => props.store.getState().a);
	useLayoutEffect(() => {
		props.probe.value = 'A' + value;
	}, null);
	<span id="selected-a">{'A' + value}</span>
}

function SelectedB(props) @{
	const value = useSyncExternalStore(props.store.subscribe, () => props.store.getState().b);
	useLayoutEffect(() => {
		props.probe.value = 'B' + value;
	}, null);
	<span id="selected-b">{'B' + value}</span>
}

export function SelectedPair(props) @{
	<div>
		<SelectedA store={props.store} probe={props.aProbe} />
		<SelectedB store={props.store} probe={props.bProbe} />
	</div>
}

function CommitMutator(props) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.getState);
	useLayoutEffect(() => {
		if (props.step === 1) {
			props.store.set({ a: value.a, b: 2 });
		}
	}, [props.step]);
	<span hidden />
}

function ChangingSelection(props) @{
	const label =
		props.step === 0 ? 'A' : 'B';
	const getSnapshot =
		props.step === 0 ? props.getSnapshotA : props.getSnapshotB;
	const value = useSyncExternalStore(props.store.subscribe, getSnapshot);
	<span id="commit-selection">{label + value}</span>
}

export function SelectionChangeDuringCommit(props) @{
	const [step, setStep] = useState(0);
	controls.setStep = setStep;
	<div>
		<CommitMutator store={props.store} step={step} />
		<ChangingSelection
			store={props.store}
			step={step}
			getSnapshotA={props.getSnapshotA}
			getSnapshotB={props.getSnapshotB}
		/>
	</div>
}

function StableSelection(props) @{
	const value = useSyncExternalStore(props.store.subscribe, props.getSnapshotA);
	useLayoutEffect(() => {
		if (props.commitProbe.lastStep === props.step) {
			props.commitProbe.repeatedStep = props.step;
		} else {
			props.commitProbe.lastStep = props.step;
		}
	}, null);
	<span id="stable-commit-selection">{'A' + value}</span>
}

export function StableSelectionDuringCommit(props) @{
	const [step, setStep] = useState(0);
	controls.setStep = setStep;
	<div>
		<CommitMutator store={props.store} step={step} />
		<StableSelection
			store={props.store}
			getSnapshotA={props.getSnapshotA}
			step={step}
			commitProbe={props.commitProbe}
		/>
	</div>
}

function ResettingReader(props) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.getState);
	useLayoutEffect(() => {
		if (value === 1) {
			props.store.set(0);
		}
	}, [value]);
	<span class="reset-reader">{value as string}</span>
}

function PlainReader(props) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.getState);
	<span class="plain-reader">{value as string}</span>
}

export function ResetDuringCommit(props) @{
	<div id="reset-pair">
		<ResettingReader store={props.store} />
		<PlainReader store={props.store} />
	</div>
}

export function LatestSnapshotReader(props) @{
	const [getSnapshot, setGetSnapshot] = useState(() => props.getSnapshotA);
	controls.setGetSnapshot = setGetSnapshot;
	const value = useSyncExternalStore(props.store.subscribe, getSnapshot);
	<span id="latest-snapshot">{value as string}</span>
}

function ThrowingSnapshotReader(props) @{
	const value = useSyncExternalStore(props.store.subscribe, () => {
		const state = props.store.getState();
		if (state.throwInGetSnapshot) throw new Error('Error in getSnapshot');
		return state.value;
	});
	<span id="throwing-snapshot-value">{value as string}</span>
}

export function SnapshotErrorBoundary(props) @{
	@try {
		<ThrowingSnapshotReader store={props.store} />
	} @catch (error) {
		<span id="snapshot-error">{error.message as string}</span>
	}
}

export function UncachedSnapshotReader(props) @{
	const value = useSyncExternalStore(props.store.subscribe, () => ({}));
	<span id="uncached-snapshot">{JSON.stringify(value)}</span>
}

export function NumberSnapshotReader(props) @{
	const value = useSyncExternalStore(
		props.store.subscribe,
		() => parseInt(props.store.getState(), 10),
	);
	<span id="number-snapshot">{value as string}</span>
}

export function DerivedSnapshotReader(props) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.getState);
	const [derivedValue, setDerivedValue] = useState(value);
	useEffect(() => {}, []);
	if (derivedValue !== value.toUpperCase()) setDerivedValue(value.toUpperCase());
	<span id="derived-snapshot">{derivedValue as string}</span>
}

export function HydrationStoreReader(props) @{
	const value = useSyncExternalStore(
		props.store.subscribe,
		props.store.getState,
		props.store.getServerState,
	);
	<div id="hydrated-store" ref={props.hostRef}>{value as string}</div>
}

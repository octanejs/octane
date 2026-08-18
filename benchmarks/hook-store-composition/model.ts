import { createStore, type StoreApi } from '@octanejs/zustand/vanilla';
import {
	computed,
	getObserverTree,
	observable,
	onBecomeObserved,
	onBecomeUnobserved,
	runInAction,
	type IComputedValue,
} from '@octanejs/mobx';
import { ROW_COUNT, ROW_INDICES, UPDATE_COUNT } from './contract.mjs';

export type Lane =
	'callback-direct' | 'callback-nested' | 'raw-store' | 'zustand-traditional' | 'mobx';
export type Operation =
	'parent_rerenders' | 'changed_dependencies' | 'unchanged_selection' | 'changed_selection';
export type Callback = () => void;
export type CallbackReport = { callback: Callback; value: number };
export type Snapshot = Readonly<{
	records: readonly Readonly<{ id: number; value: number }>[];
	revision: number;
}>;
export type Selection = { value: number };
type Selector = (snapshot: Snapshot) => Selection;
type Listener = Parameters<StoreApi<Snapshot>['subscribe']>[0];
type Update = { snapshot: Snapshot; base: number };

function snapshotFor(base: number, revision: number): Snapshot {
	return Object.freeze({
		records: Object.freeze(
			ROW_INDICES.map((id: number) => Object.freeze({ id, value: base + id })),
		),
		revision,
	});
}

function observerCount(value: IComputedValue<Selection>): number {
	return getObserverTree(value).observers?.length ?? 0;
}

export function createModel(
	lane: Lane,
	diagnostics: boolean,
	showCallbackResult: (value: string) => void,
) {
	const stats = {
		selectorCalls: 0,
		equalityCalls: 0,
		snapshotReads: 0,
		notifications: 0,
		subscribeCalls: 0,
		unsubscribeInvocations: 0,
		unsubscribeCalls: 0,
		duplicateUnsubscribes: 0,
		observedTransitions: 0,
		unobservedTransitions: 0,
	};
	const initial = snapshotFor(0, 0);
	const store = createStore<Snapshot>(() => initial);
	const activeListeners = new Set<object>();
	const reports = Array<CallbackReport | undefined>(ROW_COUNT).fill(undefined);
	const observableSnapshot = observable.box<Snapshot>(initial, { deep: false });
	const observationCleanups: (() => void)[] = [];
	let base = 0;
	let revision = 0;
	let ready = false;

	const readState = diagnostics
		? () => {
				stats.snapshotReads++;
				return store.getState();
			}
		: store.getState;
	const readInitialState = diagnostics
		? () => {
				stats.snapshotReads++;
				return store.getInitialState();
			}
		: store.getInitialState;
	const readObservable = diagnostics
		? () => {
				stats.snapshotReads++;
				return observableSnapshot.get();
			}
		: () => observableSnapshot.get();
	const selectValue = diagnostics
		? (snapshot: Snapshot, index: number) => {
				stats.selectorCalls++;
				return snapshot.records[index].value;
			}
		: (snapshot: Snapshot, index: number) => snapshot.records[index].value;
	const equalSelection = diagnostics
		? (previous: Selection, next: Selection) => {
				stats.equalityCalls++;
				return previous.value === next.value;
			}
		: (previous: Selection, next: Selection) => previous.value === next.value;

	// Wrap this owned vanilla store once, preserving method identities and the
	// library's real listener arguments. There is no intermediary fan-out store.
	const api: StoreApi<Snapshot> = {
		...store,
		getState: readState,
		getInitialState: readInitialState,
		subscribe(listener: Listener) {
			const token = {};
			activeListeners.add(token);
			if (diagnostics) stats.subscribeCalls++;
			const notify: Listener = diagnostics
				? (next, previous) => {
						stats.notifications++;
						listener(next, previous);
					}
				: listener;
			const unsubscribe = store.subscribe(notify);
			return () => {
				if (diagnostics) stats.unsubscribeInvocations++;
				if (!activeListeners.delete(token)) {
					if (diagnostics) stats.duplicateUnsubscribes++;
					return;
				}
				if (diagnostics) stats.unsubscribeCalls++;
				unsubscribe();
			};
		},
	};
	const selectors: Selector[] = ROW_INDICES.map((index: number) => (snapshot: Snapshot) => ({
		value: selectValue(snapshot, index),
	}));
	const alternateSelectors: Selector[] = ROW_INDICES.map(
		(index: number) => (snapshot: Snapshot) => ({ value: selectValue(snapshot, index) + 1000 }),
	);
	const rawReaders = ROW_INDICES.map((index: number) => () => selectValue(api.getState(), index));
	const mobxSelections: IComputedValue<Selection>[] =
		lane === 'mobx'
			? ROW_INDICES.map((index: number) =>
					computed(() => selectors[index](readObservable()), {
						name: `hook-store-selection-${index}`,
						equals: equalSelection,
					}),
				)
			: [];
	if (diagnostics) {
		for (const selection of mobxSelections) {
			observationCleanups.push(
				onBecomeObserved(selection, () => stats.observedTransitions++),
				onBecomeUnobserved(selection, () => stats.unobservedTransitions++),
			);
		}
	}

	// Preparing immutable inputs is not part of the measured notification work.
	const unchanged: Update[] = Array.from({ length: UPDATE_COUNT }, (_, index) => ({
		snapshot: Object.freeze({ records: initial.records, revision: index + 1 }),
		base: 0,
	}));
	const changed: Update[] = Array.from({ length: UPDATE_COUNT }, (_, index) => ({
		snapshot: snapshotFor(index + 1, index + 1),
		base: index + 1,
	}));
	function publish(update: Update): void {
		base = update.base;
		revision = update.snapshot.revision;
		if (lane === 'mobx') {
			runInAction(() => observableSnapshot.set(update.snapshot));
		} else {
			store.setState(update.snapshot, true);
		}
	}
	function activeSubscribers(): number {
		return lane === 'mobx'
			? mobxSelections.reduce((total, selection) => total + observerCount(selection), 0)
			: activeListeners.size;
	}

	return {
		lane,
		diagnostics,
		api,
		selectors,
		alternateSelectors,
		rawReaders,
		mobxSelections,
		equalSelection,
		activeSubscribers,
		get base() {
			return base;
		},
		get ready() {
			return ready;
		},
		setReady(value: boolean) {
			ready = value;
		},
		publishUnchanged(index: number) {
			publish(unchanged[index]);
		},
		publishChanged(index: number) {
			publish(changed[index]);
		},
		writeSelected(value: number) {
			publish({ snapshot: snapshotFor(value, revision + 1), base: value });
		},
		reportCallback(index: number, value: number, callback: Callback) {
			reports[index] = { callback, value };
			showCallbackResult(`${index}:${value}`);
		},
		clearCallbackReports() {
			reports.fill(undefined);
			showCallbackResult('');
		},
		callbackReports() {
			return reports.slice();
		},
		readDiagnostics() {
			return {
				...stats,
				retainedSubscribers: activeSubscribers(),
				// MobX observation transitions are not Reaction create/dispose counts.
				subscriptionKind: lane === 'mobx' ? 'mobx-computed-observation' : 'vanilla-listener',
			};
		},
		disposeDiagnostics() {
			for (const cleanup of observationCleanups) cleanup();
		},
	};
}

export type BenchmarkModel = ReturnType<typeof createModel>;

import { memo, useSyncExternalStore } from 'preact/compat';
import { useMemo, useState } from 'preact/hooks';
import {
	SELECTOR_SUBSCRIBERS,
	getStoreSelectorStress,
	markSubscriberRender,
	selectTotal,
} from '../../../../store-selector-fanout/shared.js';

// React's `use-sync-external-store/with-selector` shape: the cached read is
// keyed on the selector's identity, so a selector argument that is reallocated
// every render throws the cache away and re-runs the selection.
function useStoreSelector(selector) {
	const store = getStoreSelectorStress().store;
	const read = useMemo(() => {
		let cachedSnapshot = null;
		let cachedSelection = 0;
		return () => {
			const snapshot = store.getSnapshot();
			if (snapshot === cachedSnapshot) return cachedSelection;
			cachedSnapshot = snapshot;
			cachedSelection = selector(snapshot);
			return cachedSelection;
		};
	}, [store, selector]);

	return useSyncExternalStore(store.subscribe, read, read);
}

const StoreSubscriber = memo(function StoreSubscriber({ generation, index }) {
	const total = useStoreSelector((snapshot) => selectTotal(snapshot.values));
	markSubscriberRender();
	return (
		<output data-subscriber-index={index} data-generation={generation}>
			{total}
		</output>
	);
});

export function App() {
	const [visible, setVisible] = useState(false);
	const [generation, setGeneration] = useState(0);
	const stress = getStoreSelectorStress();
	const store = stress.store;
	// The harness drives discrete parent renders through this, so a re-render
	// costs no Playwright round trip and no timer floor.
	stress.bump = () => setGeneration((value) => value + 1);

	return (
		<main>
			<button id="selector-toggle" type="button" onClick={() => setVisible((value) => !value)}>
				Toggle subscribers
			</button>
			<button id="selector-write" type="button" onClick={() => store.writeAll(7)}>
				Write every store value
			</button>
			<button id="selector-rewrite" type="button" onClick={() => store.writeAll(9)}>
				Rewrite every store value
			</button>
			<output id="selector-generation">{generation}</output>
			{visible && (
				<div id="selector-subscribers">
					{SELECTOR_SUBSCRIBERS.map((index) => (
						<StoreSubscriber generation={generation} index={index} key={index} />
					))}
				</div>
			)}
		</main>
	);
}

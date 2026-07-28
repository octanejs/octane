import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js';
import {
	SELECTOR_SUBSCRIBERS,
	getStoreSelectorStress,
	markSubscriberRender,
	selectTotal,
} from '../../../../store-selector-fanout/shared.js';

// Solid has no render pass to re-run, so the selection is a `createMemo` over
// the snapshot signal: it recomputes when the store publishes a new snapshot
// and never because a parent rendered.
function StoreSubscriber(props) {
	const store = getStoreSelectorStress().store;
	const [snapshot, setSnapshot] = createSignal(store.getSnapshot());
	const unsubscribe = store.subscribe(() => setSnapshot(store.getSnapshot()));
	onCleanup(unsubscribe);
	const total = createMemo(() => selectTotal(snapshot().values));
	markSubscriberRender();

	return (
		<output data-subscriber-index={props.index} data-generation={props.generation}>
			{total()}
		</output>
	);
}

export function App() {
	const [visible, setVisible] = createSignal(false);
	const [generation, setGeneration] = createSignal(0);
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
			<output id="selector-generation">{generation()}</output>
			<Show when={visible()}>
				<div id="selector-subscribers">
					<For each={SELECTOR_SUBSCRIBERS}>
						{(index) => <StoreSubscriber generation={generation()} index={index} />}
					</For>
				</div>
			</Show>
		</main>
	);
}

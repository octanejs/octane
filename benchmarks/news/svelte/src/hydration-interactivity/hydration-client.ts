import { flushSync, hydrate } from 'svelte';
import { completeHydration, hydrationProps } from '../../../../hydration-interactivity/shared.js';
import App from './App.svelte';

export function hydrateBenchmark() {
	const container = document.getElementById('app');
	if (!container) throw new Error('Missing hydration benchmark root');

	return completeHydration(() => {
		let root: ReturnType<typeof hydrate> | undefined;
		flushSync(() => {
			root = hydrate(App, { target: container, props: hydrationProps(), recover: false });
		});
		return root;
	});
}

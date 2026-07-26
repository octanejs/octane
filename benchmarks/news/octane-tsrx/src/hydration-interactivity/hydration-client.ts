import { flushSync, hydrateRoot } from 'octane';
import { completeHydration, hydrationProps } from '../../../../hydration-interactivity/shared.js';
import { App } from './App.tsrx';

export function hydrateBenchmark() {
	const container = document.getElementById('app');
	if (!container) throw new Error('Missing hydration benchmark root');

	return completeHydration(() => {
		const root = hydrateRoot(container, App, hydrationProps());
		flushSync(() => {});
		return root;
	});
}

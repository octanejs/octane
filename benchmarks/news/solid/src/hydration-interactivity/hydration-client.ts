import { hydrate } from '@solidjs/web';
import { completeHydration, hydrationProps } from '../../../../hydration-interactivity/shared.js';
import { App } from './App.tsrx';

export function hydrateBenchmark() {
	const container = document.getElementById('app');
	if (!container) throw new Error('Missing hydration benchmark root');

	return completeHydration(() => hydrate(() => App(hydrationProps()), container));
}

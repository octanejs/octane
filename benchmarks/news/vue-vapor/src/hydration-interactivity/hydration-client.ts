import { createVaporSSRApp } from 'vue';
import { completeHydration, hydrationProps } from '../../../../hydration-interactivity/shared.js';
import App from './App.vue';

export function hydrateBenchmark() {
	const container = document.getElementById('app');
	if (!container) throw new Error('Missing hydration benchmark root');

	return completeHydration(() => {
		const root = createVaporSSRApp(App, hydrationProps());
		root.mount(container);
		return root;
	});
}

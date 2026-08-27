import { hydrate } from 'inferno-hydrate';
import { createElement } from 'inferno-create-element';
import { completeHydration, hydrationProps } from '../../../../hydration-interactivity/shared.js';
import { App } from './App.jsx';

export function hydrateBenchmark() {
	const container = document.getElementById('app');
	if (!container) throw new Error('Missing hydration benchmark root');
	return completeHydration(() => hydrate(createElement(App, hydrationProps()), container));
}

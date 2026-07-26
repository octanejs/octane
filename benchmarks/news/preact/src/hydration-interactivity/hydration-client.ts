import { createElement, hydrate } from 'preact';
import { flushSync } from 'preact/compat';
import { completeHydration, hydrationProps } from '../../../../hydration-interactivity/shared.js';
import { App } from './App.jsx';

export function hydrateBenchmark() {
	const container = document.getElementById('app');
	if (!container) throw new Error('Missing hydration benchmark root');

	return completeHydration(() =>
		flushSync(() => hydrate(createElement(App, hydrationProps()), container)),
	);
}
